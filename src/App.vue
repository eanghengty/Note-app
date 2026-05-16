<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { deleteNote, deleteTag, getNotes, getTags, saveNote, saveTag, seedIfEmpty } from './db'

const noteTypes = ['quick', 'meeting', 'project', 'analysis', 'reference']

const smartViewDefinitions = [
  {
    id: 'all',
    label: 'All notes',
    description: 'Everything in one quiet stream.',
    predicate: () => true,
  },
  {
    id: 'recent',
    label: 'Recent',
    description: 'What you touched lately.',
    predicate: (note) => daysSince(note.updatedAt) <= 7,
  },
  {
    id: 'pinned',
    label: 'Pinned',
    description: 'The notes you keep close.',
    predicate: (note) => note.pinned,
  },
  {
    id: 'meetings',
    label: 'Meetings',
    description: 'Calls, agendas, and follow-ups.',
    predicate: (note) => note.type === 'meeting',
  },
  {
    id: 'quick',
    label: 'Quick notes',
    description: 'Fast captures and short thoughts.',
    predicate: (note) => note.type === 'quick',
  },
  {
    id: 'untagged',
    label: 'Untagged',
    description: 'Notes that still need sorting.',
    predicate: (note) => !note.tags?.length,
  },
]

const state = reactive({
  ready: false,
  screen: 'home',
  notes: [],
  tags: [],
  activeNoteId: null,
  search: '',
  selectedType: '',
  selectedTagId: '',
  smartView: 'all',
  saveStatus: 'idle',
})

const captureType = ref('quick')
const captureTitle = ref('')
const draftTag = ref('')
const saveTimer = ref(null)
const searchInput = ref(null)

const activeNote = computed(() => {
  return state.notes.find((note) => note.id === state.activeNoteId) || null
})

const activeNoteSnapshot = computed(() => {
  if (!activeNote.value) return ''

  const { title, body, type, tags, pinned } = activeNote.value
  return JSON.stringify({
    title,
    body,
    type,
    tags: [...(tags || [])].sort(),
    pinned,
  })
})

const selectedTag = computed(() => {
  return state.tags.find((tag) => tag.id === state.selectedTagId) || null
})

const sortedNotes = computed(() => sortNotes(state.notes))

const smartViews = computed(() => {
  return smartViewDefinitions.map((view) => ({
    ...view,
    count: sortedNotes.value.filter(view.predicate).length,
  }))
})

const activeSmartView = computed(() => {
  return smartViews.value.find((view) => view.id === state.smartView) || smartViews.value[0]
})

const filteredNotes = computed(() => {
  const query = state.search.trim().toLowerCase()

  return sortedNotes.value.filter((note) => {
    const matchesSmartView = activeSmartView.value?.predicate(note) ?? true
    const matchesType = !state.selectedType || note.type === state.selectedType
    const matchesTag = !state.selectedTagId || note.tags.includes(state.selectedTagId)
    const matchesQuery =
      !query ||
      `${note.title}\n${note.body}\n${note.tags.join(' ')}`.toLowerCase().includes(query)

    return matchesSmartView && matchesType && matchesTag && matchesQuery
  })
})

const stats = computed(() => {
  return {
    notes: state.notes.length,
    pinned: state.notes.filter((note) => note.pinned).length,
    tags: state.tags.length,
    words: state.notes.reduce((sum, note) => sum + countWords(note.body), 0),
  }
})

const recentNotes = computed(() => sortedNotes.value.slice(0, 6))
const pinnedNotes = computed(() => sortedNotes.value.filter((note) => note.pinned).slice(0, 4))

const notesByType = computed(() => {
  return noteTypes.map((type) => ({
    type,
    count: state.notes.filter((note) => note.type === type).length,
  }))
})

const wordsInActiveNote = computed(() => countWords(activeNote.value?.body || ''))

const activeNoteTags = computed(() => {
  if (!activeNote.value) return []
  return state.tags.filter((tag) => activeNote.value.tags.includes(tag.id))
})

const headerTitle = computed(() => {
  if (state.screen === 'editor') return activeNote.value?.title || 'New note'
  if (state.screen === 'library') return activeSmartView.value?.label || 'Library'
  return 'Home'
})

const searchSummary = computed(() => {
  const parts = [activeSmartView.value?.label]
  if (state.selectedType) parts.push(state.selectedType)
  if (selectedTag.value) parts.push(`#${selectedTag.value.label}`)
  if (state.search.trim()) parts.push(`"${state.search.trim()}"`)
  return parts.filter(Boolean).join(' · ')
})

watch(
  () => state.activeNoteId,
  (id) => {
    if (!id && state.notes.length > 0) {
      state.activeNoteId = state.notes[0].id
    }
    if (!id && state.screen === 'editor') {
      state.screen = 'home'
    }
  },
)

watch(
  () => state.search,
  (value) => {
    if (value.trim() && state.screen !== 'library') {
      state.screen = 'library'
    }
  },
)

watch(
  activeNoteSnapshot,
  (snapshot) => {
    if (!snapshot || !activeNote.value) return

    if (saveTimer.value) {
      clearTimeout(saveTimer.value)
    }

    state.saveStatus = 'typing'
    const noteId = activeNote.value.id

    saveTimer.value = setTimeout(async () => {
      await persistNoteById(noteId)
    }, 300)
  },
  { deep: true },
)

onMounted(async () => {
  await seedIfEmpty()
  await refreshAll()
  state.ready = true
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  window.removeEventListener('keydown', onGlobalKeydown)
})

async function refreshAll() {
  state.notes = await getNotes()
  state.tags = await getTags()

  if (!state.activeNoteId || !state.notes.some((note) => note.id === state.activeNoteId)) {
    state.activeNoteId = state.notes[0]?.id || null
  }
}

async function createNote(type = 'quick', title = '') {
  const now = new Date().toISOString()
  const note = await saveNote({
    id: crypto.randomUUID(),
    title: title.trim() || defaultTitle(type),
    type,
    body: defaultBody(type),
    tags: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  })

  state.notes = sortNotes([note, ...state.notes])
  state.activeNoteId = note.id
  state.screen = 'editor'
  state.saveStatus = 'saved'
  captureType.value = 'quick'
  captureTitle.value = ''
}

async function persistNoteById(noteId) {
  if (saveTimer.value) {
    clearTimeout(saveTimer.value)
    saveTimer.value = null
  }

  const note = state.notes.find((item) => item.id === noteId)
  if (!note) return

  state.saveStatus = 'saving'
  const saved = await saveNote(note)
  const index = state.notes.findIndex((item) => item.id === saved.id)

  if (index >= 0) {
    state.notes[index] = saved
    state.notes = sortNotes([...state.notes])
  }

  state.saveStatus = 'saved'
}

async function removeCurrentNote() {
  if (!activeNote.value) return
  const confirmed = window.confirm(`Delete "${activeNote.value.title}"? This cannot be undone.`)
  if (!confirmed) return

  const currentId = activeNote.value.id
  await deleteNote(currentId)
  state.notes = state.notes.filter((note) => note.id !== currentId)
  state.activeNoteId = state.notes[0]?.id || null
  state.screen = state.notes.length ? 'library' : 'home'
}

async function togglePin() {
  if (!activeNote.value) return
  activeNote.value.pinned = !activeNote.value.pinned
  await persistNoteById(activeNote.value.id)
}

async function addTag() {
  const label = draftTag.value.trim()
  if (!label) return

  const existing = state.tags.find((tag) => tag.label.toLowerCase() === label.toLowerCase())
  if (existing) {
    draftTag.value = ''
    return
  }

  const saved = await saveTag({
    label,
    hue: Math.floor(Math.random() * 360),
  })

  state.tags = [...state.tags, saved].sort((a, b) => a.label.localeCompare(b.label))
  draftTag.value = ''
}

async function toggleNoteTag(tagId) {
  if (!activeNote.value) return

  const tags = new Set(activeNote.value.tags)
  if (tags.has(tagId)) tags.delete(tagId)
  else tags.add(tagId)

  activeNote.value.tags = [...tags]
  await persistNoteById(activeNote.value.id)
}

async function removeTagEverywhere(tagId) {
  const tag = state.tags.find((item) => item.id === tagId)
  const confirmed = window.confirm(`Delete tag "${tag?.label || 'tag'}" from the workspace?`)
  if (!confirmed) return

  await deleteTag(tagId)
  await refreshAll()
  if (state.selectedTagId === tagId) {
    state.selectedTagId = ''
  }
}

function clearFilters() {
  state.smartView = 'all'
  state.selectedType = ''
  state.selectedTagId = ''
  state.search = ''
}

function openLibrary(viewId = 'all') {
  state.smartView = viewId
  state.screen = 'library'
}

function openSearch() {
  state.screen = 'library'
  nextTick(() => searchInput.value?.focus())
}

function openNote(noteId) {
  state.activeNoteId = noteId
  state.screen = 'editor'
}

function onGlobalKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    state.screen = 'home'
    nextTick(() => {
      const titleInput = document.querySelector('.capture-input')
      titleInput?.focus()
    })
  }
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatShortDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatRelativeDate(value) {
  if (!value) return ''
  const diff = daysSince(value)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff}d ago`
  return formatShortDate(value)
}

function notePreview(note) {
  return note.body.trim().split('\n').find(Boolean) || 'No content yet'
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned)
    return new Date(b.updatedAt) - new Date(a.updatedAt)
  })
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length
}

function daysSince(value) {
  const now = new Date()
  const target = new Date(value)
  return Math.floor((now - target) / 86400000)
}

function defaultTitle(type) {
  if (type === 'meeting') return 'Meeting note'
  if (type === 'analysis') return 'Working analysis'
  if (type === 'project') return 'Project note'
  if (type === 'reference') return 'Reference note'
  return 'Quick note'
}

function defaultBody(type) {
  if (type === 'meeting') {
    return 'Agenda\n- \n\nNotes\n\nAction items\n- '
  }

  if (type === 'analysis') {
    return 'Context\n\nObservations\n\nNext steps'
  }

  return ''
}
</script>

<template>
  <div v-if="state.ready" class="app-shell">
    <aside class="rail">
      <div class="brand-block">
        <div class="brand-mark"></div>
        <div>
          <p class="eyebrow">Calm workspace</p>
          <h1>Ledger</h1>
        </div>
      </div>

      <nav class="rail-nav">
        <button :class="['rail-link', { active: state.screen === 'home' }]" @click="state.screen = 'home'">Home</button>
        <button :class="['rail-link', { active: state.screen === 'library' }]" @click="openLibrary()">Search & notes</button>
        <button :class="['rail-link', { active: state.screen === 'editor' }]" @click="state.activeNoteId ? state.screen = 'editor' : openLibrary()">
          Editor
        </button>
      </nav>

      <section class="rail-section">
        <div class="section-line">
          <h2>Smart views</h2>
        </div>
        <button
          v-for="view in smartViews"
          :key="view.id"
          :class="['smart-link', { active: state.smartView === view.id }]"
          @click="openLibrary(view.id)"
        >
          <span>{{ view.label }}</span>
          <span>{{ view.count }}</span>
        </button>
      </section>

      <section class="rail-section">
        <div class="section-line">
          <h2>Tags</h2>
          <button v-if="selectedTag" class="micro-btn" @click="state.selectedTagId = ''">Clear</button>
        </div>
        <div class="mini-tag-list">
          <button
            v-for="tag in state.tags.slice(0, 8)"
            :key="tag.id"
            :class="['mini-tag', { active: state.selectedTagId === tag.id }]"
            @click="state.selectedTagId = state.selectedTagId === tag.id ? '' : tag.id; openLibrary(state.smartView)"
          >
            <span class="tag-dot" :style="{ backgroundColor: `hsl(${tag.hue}, 70%, 48%)` }"></span>
            <span>{{ tag.label }}</span>
          </button>
        </div>
      </section>

      <div class="rail-foot">
        <p class="eyebrow">Local-first</p>
        <p>Everything stays in IndexedDB on this device.</p>
      </div>
    </aside>

    <main class="main-shell">
      <header class="topbar">
        <div class="topbar-copy">
          <p class="eyebrow">Notes that stay out of your way</p>
          <h2>{{ headerTitle }}</h2>
        </div>

        <div class="topbar-tools">
          <label class="search-shell">
            <span class="search-glyph">⌕</span>
            <input
              ref="searchInput"
              v-model="state.search"
              type="search"
              placeholder="Search notes, tags, or content"
              @focus="state.screen = 'library'"
            />
          </label>

          <div class="capture-bar">
            <select v-model="captureType" aria-label="Capture type">
              <option v-for="type in noteTypes" :key="type" :value="type">{{ type }}</option>
            </select>
            <input
              v-model="captureTitle"
              class="capture-input"
              type="text"
              placeholder="Type a title to capture"
              @keydown.enter="createNote(captureType, captureTitle)"
            />
            <button class="primary-btn" @click="createNote(captureType, captureTitle)">Create</button>
          </div>
        </div>
      </header>

      <section v-if="state.screen === 'home'" class="screen-grid">
        <article class="hero-panel">
          <div class="hero-copy">
            <p class="eyebrow">Daily workflow</p>
            <h3>Capture faster, find anything, and write without clutter.</h3>
            <p>
              Ledger now centers around a calmer reading surface, smart views, and search-first navigation so you can move from idea to note without losing momentum.
            </p>
          </div>

          <div class="hero-meta">
            <div class="meta-pill">
              <span class="meta-label">Search</span>
              <strong>Cmd/Ctrl + K</strong>
            </div>
            <div class="meta-pill">
              <span class="meta-label">New capture</span>
              <strong>Cmd/Ctrl + N</strong>
            </div>
          </div>
        </article>

        <section class="metric-row">
          <article class="metric-card">
            <span class="metric-label">Total notes</span>
            <strong>{{ stats.notes }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">Pinned notes</span>
            <strong>{{ stats.pinned }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">Words stored</span>
            <strong>{{ stats.words }}</strong>
          </article>
          <article class="metric-card">
            <span class="metric-label">Tags</span>
            <strong>{{ stats.tags }}</strong>
          </article>
        </section>

        <section class="content-grid">
          <article class="surface-card">
            <div class="section-line">
              <h3>Smart views</h3>
              <button class="micro-btn" @click="openLibrary()">Open library</button>
            </div>
            <div class="smart-grid">
              <button
                v-for="view in smartViews"
                :key="view.id"
                class="smart-card"
                @click="openLibrary(view.id)"
              >
                <div>
                  <strong>{{ view.label }}</strong>
                  <p>{{ view.description }}</p>
                </div>
                <span>{{ view.count }}</span>
              </button>
            </div>
          </article>

          <article class="surface-card">
            <div class="section-line">
              <h3>Recent notes</h3>
              <button class="micro-btn" @click="openLibrary('recent')">See all</button>
            </div>

            <div v-if="recentNotes.length" class="note-stack">
              <button
                v-for="note in recentNotes"
                :key="note.id"
                class="stack-row"
                @click="openNote(note.id)"
              >
                <div>
                  <strong>{{ note.title }}</strong>
                  <p>{{ notePreview(note) }}</p>
                </div>
                <span>{{ formatRelativeDate(note.updatedAt) }}</span>
              </button>
            </div>
            <div v-else class="empty-copy">No notes yet. Use the capture bar above to create your first one.</div>
          </article>

          <article class="surface-card">
            <div class="section-line">
              <h3>Pinned</h3>
              <button class="micro-btn" @click="openLibrary('pinned')">Open</button>
            </div>

            <div v-if="pinnedNotes.length" class="pin-grid">
              <button
                v-for="note in pinnedNotes"
                :key="note.id"
                class="pin-card"
                @click="openNote(note.id)"
              >
                <span class="pin-mark">★</span>
                <strong>{{ note.title }}</strong>
                <p>{{ notePreview(note) }}</p>
              </button>
            </div>
            <div v-else class="empty-copy">Pin a few working notes to keep them easy to reach.</div>
          </article>

          <article class="surface-card">
            <div class="section-line">
              <h3>Tag studio</h3>
            </div>

            <div class="tag-studio">
              <div class="tag-form">
                <input v-model="draftTag" type="text" placeholder="Add a new tag" @keydown.enter="addTag" />
                <button class="secondary-btn" @click="addTag">Add tag</button>
              </div>

              <div v-if="state.tags.length" class="tag-admin-list">
                <div v-for="tag in state.tags" :key="tag.id" class="tag-admin-row">
                  <button class="tag-admin-chip" @click="state.selectedTagId = tag.id; openLibrary()">
                    <span class="tag-dot" :style="{ backgroundColor: `hsl(${tag.hue}, 70%, 48%)` }"></span>
                    <span>{{ tag.label }}</span>
                  </button>
                  <button class="micro-btn danger" @click="removeTagEverywhere(tag.id)">Delete</button>
                </div>
              </div>
              <div v-else class="empty-copy">No tags yet. Create a few to make filtering faster later.</div>
            </div>
          </article>
        </section>
      </section>

      <section v-else-if="state.screen === 'library'" class="screen-grid">
        <article class="surface-card library-hero">
          <div>
            <p class="eyebrow">Search-first library</p>
            <h3>{{ activeSmartView.label }}</h3>
            <p>{{ searchSummary }}</p>
          </div>

          <div class="filter-actions">
            <select v-model="state.selectedType">
              <option value="">All types</option>
              <option v-for="item in notesByType" :key="item.type" :value="item.type">
                {{ item.type }} ({{ item.count }})
              </option>
            </select>
            <button class="secondary-btn" @click="clearFilters">Reset filters</button>
          </div>
        </article>

        <article class="surface-card">
          <div class="chip-row">
            <button
              v-for="view in smartViews"
              :key="view.id"
              :class="['view-chip', { active: state.smartView === view.id }]"
              @click="state.smartView = view.id"
            >
              {{ view.label }}
              <span>{{ view.count }}</span>
            </button>
          </div>

          <div v-if="state.tags.length" class="chip-row tags">
            <button
              :class="['tag-filter-chip', { active: !state.selectedTagId }]"
              @click="state.selectedTagId = ''"
            >
              All tags
            </button>
            <button
              v-for="tag in state.tags"
              :key="tag.id"
              :class="['tag-filter-chip', { active: state.selectedTagId === tag.id }]"
              @click="state.selectedTagId = state.selectedTagId === tag.id ? '' : tag.id"
            >
              <span class="tag-dot" :style="{ backgroundColor: `hsl(${tag.hue}, 70%, 48%)` }"></span>
              {{ tag.label }}
            </button>
          </div>

          <div v-if="filteredNotes.length" class="results-list">
            <button
              v-for="note in filteredNotes"
              :key="note.id"
              class="result-card"
              @click="openNote(note.id)"
            >
              <div class="result-head">
                <div>
                  <div class="result-title">
                    <span v-if="note.pinned" class="pin-mark">★</span>
                    <strong>{{ note.title }}</strong>
                  </div>
                  <p>{{ notePreview(note) }}</p>
                </div>

                <div class="result-meta">
                  <span class="type-pill">{{ note.type }}</span>
                  <span>{{ formatRelativeDate(note.updatedAt) }}</span>
                </div>
              </div>

              <div v-if="note.tags.length" class="result-tags">
                <span
                  v-for="tagId in note.tags.slice(0, 3)"
                  :key="tagId"
                  class="inline-tag"
                >
                  #{{ state.tags.find((tag) => tag.id === tagId)?.label || 'tag' }}
                </span>
              </div>
            </button>
          </div>
          <div v-else class="empty-copy roomy">
            <strong>No notes match this view.</strong>
            <p>Try clearing a filter, switching smart views, or capture a new note from the top bar.</p>
          </div>
        </article>
      </section>

      <section v-else class="screen-grid">
        <article v-if="activeNote" class="editor-surface">
          <div class="editor-topbar">
            <div class="editor-topbar-copy">
              <button class="back-link" @click="openLibrary(state.smartView)">← Back to library</button>
              <div class="editor-status">
                <span>{{ wordsInActiveNote }} words</span>
                <span>{{ formatDate(activeNote.updatedAt) }}</span>
                <span class="save-indicator" :data-state="state.saveStatus">
                  {{ state.saveStatus === 'saving' ? 'Saving…' : state.saveStatus === 'typing' ? 'Editing…' : 'Saved' }}
                </span>
              </div>
            </div>

            <div class="editor-actions">
              <button class="secondary-btn" @click="togglePin">{{ activeNote.pinned ? 'Unpin' : 'Pin note' }}</button>
              <button class="ghost-btn danger" @click="removeCurrentNote">Delete</button>
            </div>
          </div>

          <div class="editor-layout">
            <div class="editor-main">
              <textarea
                v-model="activeNote.title"
                class="title-textarea"
                rows="2"
                placeholder="Untitled note"
              ></textarea>

              <div class="editor-meta-row">
                <select v-model="activeNote.type" class="type-select">
                  <option v-for="type in noteTypes" :key="type" :value="type">{{ type }}</option>
                </select>
                <span v-if="activeNote.pinned" class="pin-pill">Pinned</span>
                <span class="meta-faint">Created {{ formatDate(activeNote.createdAt) }}</span>
              </div>

              <textarea
                v-model="activeNote.body"
                class="body-textarea"
                placeholder="Write clearly. Keep the next step obvious."
              ></textarea>
            </div>

            <aside class="editor-sidecar">
              <div class="sidecar-block">
                <p class="eyebrow">Note tags</p>
                <div v-if="state.tags.length" class="tag-toggle-grid">
                  <button
                    v-for="tag in state.tags"
                    :key="tag.id"
                    :class="['tag-toggle', { active: activeNote.tags.includes(tag.id) }]"
                    @click="toggleNoteTag(tag.id)"
                  >
                    <span class="tag-dot" :style="{ backgroundColor: `hsl(${tag.hue}, 70%, 48%)` }"></span>
                    {{ tag.label }}
                  </button>
                </div>
                <div v-else class="empty-copy compact">No tags yet. Create them from Home.</div>
              </div>

              <div class="sidecar-block">
                <p class="eyebrow">Attached now</p>
                <div v-if="activeNoteTags.length" class="selected-tags">
                  <span
                    v-for="tag in activeNoteTags"
                    :key="tag.id"
                    class="inline-tag selected"
                  >
                    #{{ tag.label }}
                  </span>
                </div>
                <div v-else class="empty-copy compact">This note is still untagged.</div>
              </div>
            </aside>
          </div>
        </article>

        <article v-else class="surface-card empty-editor">
          <p class="eyebrow">Nothing selected</p>
          <h3>Open a note or capture a new one.</h3>
          <p>The editor appears here once you choose a note from the library.</p>
          <button class="primary-btn" @click="openLibrary()">Browse notes</button>
        </article>
      </section>
    </main>

    <nav class="mobile-nav">
      <button :class="{ active: state.screen === 'home' }" @click="state.screen = 'home'">Home</button>
      <button :class="{ active: state.screen === 'library' }" @click="openSearch()">Search</button>
      <button :class="{ active: state.screen === 'library' }" @click="openLibrary()">Notes</button>
      <button :class="{ active: state.screen === 'editor' }" @click="state.activeNoteId ? state.screen = 'editor' : openLibrary()">Editor</button>
    </nav>
  </div>

  <div v-else class="loading-screen">
    <p>Loading Ledger…</p>
  </div>
</template>
