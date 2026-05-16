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
    predicate: (note) => !(note.tags || []).length,
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
  editorDetailsOpen: false,
})

const captureType = ref('quick')
const captureTitle = ref('')
const draftTag = ref('')
const saveTimer = ref(null)
const saveInFlight = ref(false)
const queuedSaveNoteId = ref(null)
const searchInput = ref(null)
const editorBody = ref(null)
const lastPersistedSnapshots = reactive({})
const DRAFT_STORAGE_KEY = 'ledger-note-drafts'

const activeNote = computed(() => {
  return state.notes.find((note) => note.id === state.activeNoteId) || null
})

const isFocusedEditor = computed(() => {
  return state.screen === 'editor' && !!activeNote.value
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
    const matchesTag = !state.selectedTagId || (note.tags || []).includes(state.selectedTagId)
    const matchesQuery =
      !query ||
      `${note.title}\n${notePlainText(note)}\n${noteTagLabels(note).join(' ')}`.toLowerCase().includes(query)

    return matchesSmartView && matchesType && matchesTag && matchesQuery
  })
})

const stats = computed(() => {
  return {
    notes: state.notes.length,
    pinned: state.notes.filter((note) => note.pinned).length,
    tags: state.tags.length,
    words: state.notes.reduce((sum, note) => sum + countWords(notePlainText(note)), 0),
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

const wordsInActiveNote = computed(() => countWords(notePlainText(activeNote.value)))

const activeNoteTags = computed(() => {
  if (!activeNote.value) return []
  return state.tags.filter((tag) => (activeNote.value.tags || []).includes(tag.id))
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
  return parts.filter(Boolean).join(' / ')
})

watch(
  () => state.activeNoteId,
  async (id) => {
    if (!id && state.notes.length > 0) {
      state.activeNoteId = state.notes[0].id
      return
    }

    state.editorDetailsOpen = false

    if (!id && state.screen === 'editor') {
      state.screen = 'home'
      return
    }

    setLastPersistedSnapshot(id, serializeNoteForSave(activeNote.value))

    if (state.screen === 'editor' && id) {
      await nextTick()
      syncEditorBodyFromNote()
      focusEditorBody()
    }
  },
)

watch(
  () => state.search,
  (value) => {
    if (value.trim() && state.screen !== 'library') {
      state.screen = 'library'
      state.editorDetailsOpen = false
    }
  },
)

watch(
  () => state.screen,
  async (screen) => {
    if (screen !== 'editor') {
      state.editorDetailsOpen = false
      return
    }

    await nextTick()
    syncEditorBodyFromNote()
    focusEditorBody()
  },
)

watch(
  () => activeNote.value?.body,
  async () => {
    if (!isFocusedEditor.value) return

    await nextTick()

    if (!editorBody.value || document.activeElement === editorBody.value) return
    syncEditorBodyFromNote()
  },
)

watch(
  activeNoteSnapshot,
  (snapshot) => {
    if (!snapshot || !activeNote.value) return
    backupDraft(activeNote.value)

    if (!state.ready || snapshot === getLastPersistedSnapshot(activeNote.value.id)) {
      if (snapshot === getLastPersistedSnapshot(activeNote.value.id) && state.saveStatus !== 'saving') {
        state.saveStatus = 'saved'
      }
      return
    }

    if (saveTimer.value) {
      clearTimeout(saveTimer.value)
    }

    state.saveStatus = 'typing'
    const noteId = activeNote.value.id

    saveTimer.value = setTimeout(async () => {
      await persistNoteById(noteId)
    }, 180)
  },
  { deep: true },
)

onMounted(async () => {
  await seedIfEmpty()
  await refreshAll()
  state.ready = true
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  flushPendingSave()
})

async function refreshAll() {
  state.notes = await getNotes()
  state.tags = await getTags()
  restoreDraftsIntoState()

  if (!state.activeNoteId || !state.notes.some((note) => note.id === state.activeNoteId)) {
    state.activeNoteId = state.notes[0]?.id || null
  }

  setLastPersistedSnapshot(state.activeNoteId, serializeNoteForSave(activeNote.value))
  if (activeNote.value) {
    state.saveStatus = 'saved'
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
  state.editorDetailsOpen = false
  setLastPersistedSnapshot(note.id, serializeNoteForSave(note))
  clearDraftBackup(note.id)
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

  if (saveInFlight.value) {
    queuedSaveNoteId.value = noteId
    return
  }

  const snapshotBeforeSave = serializeNoteForSave(note)
  if (!snapshotBeforeSave || snapshotBeforeSave === getLastPersistedSnapshot(note.id)) {
    state.saveStatus = 'saved'
    return
  }

  saveInFlight.value = true
  state.saveStatus = 'saving'
  try {
    const saved = await saveNote(note)
    const index = state.notes.findIndex((item) => item.id === saved.id)

    if (index >= 0) {
      state.notes[index] = saved
      state.notes = sortNotes([...state.notes])
    }

    setLastPersistedSnapshot(saved.id, serializeNoteForSave(saved))
    clearDraftBackup(saved.id)
    state.saveStatus = 'saved'
  } catch (error) {
    console.error('Failed to save note', error)
    state.saveStatus = 'typing'
  } finally {
    saveInFlight.value = false
  }

  if (queuedSaveNoteId.value === noteId) {
    queuedSaveNoteId.value = null
    if (serializeNoteForSave(activeNote.value) !== getLastPersistedSnapshot(noteId)) {
      await persistNoteById(noteId)
    }
  }
}

function syncActiveNoteBodyFromEditor() {
  if (!activeNote.value || !editorBody.value) return
  activeNote.value.body = normalizeEditorBody(editorBody.value.innerHTML)
}

function flushPendingSave() {
  syncActiveNoteBodyFromEditor()
  if (activeNote.value) {
    backupDraft(activeNote.value)
  }

  if (!activeNote.value) {
    if (saveTimer.value) {
      clearTimeout(saveTimer.value)
      saveTimer.value = null
    }
    return
  }

  if (saveTimer.value || state.saveStatus === 'typing') {
    persistNoteById(activeNote.value.id)
  }
}

async function removeCurrentNote() {
  if (!activeNote.value) return
  const confirmed = window.confirm(`Delete "${activeNote.value.title}"? This cannot be undone.`)
  if (!confirmed) return

  const currentId = activeNote.value.id
  await deleteNote(currentId)
  state.notes = state.notes.filter((note) => note.id !== currentId)
  state.activeNoteId = state.notes[0]?.id || null
  state.editorDetailsOpen = false
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

  const tags = new Set(activeNote.value.tags || [])
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

function openLibrary(viewId = state.smartView) {
  flushPendingSave()
  state.smartView = viewId
  state.screen = 'library'
  state.editorDetailsOpen = false
}

function openSearch() {
  flushPendingSave()
  state.screen = 'library'
  state.editorDetailsOpen = false
  nextTick(() => searchInput.value?.focus())
}

function openNote(noteId) {
  if (state.activeNoteId && state.activeNoteId !== noteId) {
    flushPendingSave()
  }
  state.activeNoteId = noteId
  state.screen = 'editor'
  state.editorDetailsOpen = false
}

function toggleEditorDetails(force) {
  state.editorDetailsOpen = typeof force === 'boolean' ? force : !state.editorDetailsOpen
}

function onGlobalKeydown(event) {
  if (event.key === 'Escape' && state.screen === 'editor') {
    if (state.editorDetailsOpen) {
      state.editorDetailsOpen = false
    } else {
      openLibrary(state.smartView)
    }
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    state.screen = 'home'
    state.editorDetailsOpen = false
    nextTick(() => {
      const titleInput = document.querySelector('.capture-input')
      titleInput?.focus()
    })
  }
}

function onPageHide() {
  flushPendingSave()
}

function onBeforeUnload() {
  flushPendingSave()
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    flushPendingSave()
  }
}

function onEditorBodyInput() {
  if (!activeNote.value || !editorBody.value) return

  const html = normalizeEditorBody(editorBody.value.innerHTML)
  activeNote.value.body = html
  syncEditorEmptyState()
}

function onEditorCheckboxChange() {
  onEditorBodyInput()
}

function onEditorBodyClick(event) {
  if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
    onEditorBodyInput()
  }
}

function focusEditorBody() {
  if (!editorBody.value || !isFocusedEditor.value) return
  editorBody.value.focus()
  placeCaretAtEnd(editorBody.value)
}

function syncEditorBodyFromNote() {
  if (!editorBody.value) return

  const html = bodyToEditableHtml(activeNote.value?.body || '')
  if (editorBody.value.innerHTML !== html) {
    editorBody.value.innerHTML = html
  }

  syncEditorEmptyState()
}

function syncEditorEmptyState() {
  if (!editorBody.value) return
  const hasText = extractNoteText(editorBody.value.innerHTML).trim().length > 0
  editorBody.value.dataset.empty = hasText ? 'false' : 'true'
}

function applyEditorCommand(command, value = null) {
  if (!editorBody.value || !activeNote.value) return

  editorBody.value.focus()
  document.execCommand(command, false, value)
  onEditorBodyInput()
}

function applyBlockFormat(tagName) {
  applyEditorCommand('formatBlock', `<${tagName}>`)
}

function insertChecklist() {
  if (!editorBody.value || !activeNote.value) return

  const markerId = `check-${crypto.randomUUID()}`
  const html = [
    `<div class="checklist-row" data-checklist-id="${markerId}">`,
    '<input type="checkbox" contenteditable="false" />',
    '<span>Checklist item</span>',
    '</div>',
    '<p><br></p>',
  ].join('')

  editorBody.value.focus()
  document.execCommand('insertHTML', false, html)
  onEditorBodyInput()

  nextTick(() => {
    const row = editorBody.value?.querySelector(`[data-checklist-id="${markerId}"] span`)
    if (!row) return
    selectNodeText(row)
  })
}

function selectNodeText(node) {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}

function placeCaretAtEnd(node) {
  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function noteTagLabels(note) {
  return (note?.tags || []).map((tagId) => state.tags.find((tag) => tag.id === tagId)?.label || 'tag')
}

function notePlainText(note) {
  return extractNoteText(note?.body || '')
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

function isStoredHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value || '')
}

function normalizeEditorBody(html) {
  const text = extractNoteText(html).trim()
  return text ? html : ''
}

function serializeNoteForSave(note) {
  if (!note) return ''

  const { title, body, type, tags, pinned } = note
  return JSON.stringify({
    title,
    body,
    type,
    tags: [...(tags || [])].sort(),
    pinned,
  })
}

function getLastPersistedSnapshot(noteId) {
  return noteId ? lastPersistedSnapshots[noteId] || '' : ''
}

function setLastPersistedSnapshot(noteId, snapshot) {
  if (!noteId) return
  lastPersistedSnapshots[noteId] = snapshot || ''
}

function bodyToEditableHtml(body) {
  if (!body) return ''
  if (isStoredHtml(body)) return body
  return plainTextToHtml(body)
}

function plainTextToHtml(text) {
  if (!text) return ''

  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function extractNoteText(body) {
  if (!body) return ''
  if (!isStoredHtml(body)) return body

  if (typeof document === 'undefined') {
    return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const scratch = document.createElement('div')
  scratch.innerHTML = body

  scratch.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    const marker = document.createTextNode(checkbox.checked ? '[x] ' : '[ ] ')
    checkbox.replaceWith(marker)
  })

  scratch.querySelectorAll('br').forEach((lineBreak) => {
    lineBreak.replaceWith(document.createTextNode('\n'))
  })

  scratch.querySelectorAll('p, div, li, blockquote, h1, h2, h3, h4, h5, h6').forEach((node) => {
    if (node.nextSibling) {
      node.after(document.createTextNode('\n'))
    }
  })

  return scratch.textContent?.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim() || ''
}

function readDraftBackupMap() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeDraftBackupMap(nextMap) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(nextMap))
  } catch {
    // Ignore storage quota or private-mode failures; IndexedDB remains primary.
  }
}

function backupDraft(note) {
  if (!note || typeof window === 'undefined') return

  const drafts = readDraftBackupMap()
  drafts[note.id] = {
    id: note.id,
    title: note.title,
    body: note.body,
    type: note.type,
    tags: Array.isArray(note.tags) ? [...note.tags] : [],
    pinned: !!note.pinned,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
  writeDraftBackupMap(drafts)
}

function clearDraftBackup(noteId) {
  if (!noteId || typeof window === 'undefined') return

  const drafts = readDraftBackupMap()
  if (!drafts[noteId]) return
  delete drafts[noteId]
  writeDraftBackupMap(drafts)
}

function restoreDraftsIntoState() {
  const drafts = readDraftBackupMap()
  const draftIds = Object.keys(drafts)
  if (!draftIds.length) return

  state.notes = sortNotes(
    state.notes.map((note) => {
      const draft = drafts[note.id]
      if (!draft) return note

      const savedSnapshot = serializeNoteForSave(note)
      const draftSnapshot = serializeNoteForSave(draft)
      if (savedSnapshot === draftSnapshot) {
        clearDraftBackup(note.id)
        return note
      }

      return {
        ...note,
        title: draft.title ?? note.title,
        body: draft.body ?? note.body,
        type: draft.type ?? note.type,
        tags: Array.isArray(draft.tags) ? draft.tags : note.tags,
        pinned: typeof draft.pinned === 'boolean' ? draft.pinned : note.pinned,
      }
    }),
  )
}
</script>

<template>
  <div v-if="state.ready" :class="['app-shell', { 'focus-mode': isFocusedEditor }]">
    <aside v-if="!isFocusedEditor" class="rail">
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

    <main :class="['main-shell', { 'editor-main-shell': isFocusedEditor }]">
      <header v-if="!isFocusedEditor" class="topbar">
        <div class="topbar-copy">
          <p class="eyebrow">Notes that stay out of your way</p>
          <h2>{{ headerTitle }}</h2>
        </div>

        <div class="topbar-tools">
          <label class="search-shell">
            <span class="search-glyph">Find</span>
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
                <span class="pin-mark">*</span>
                <strong>{{ note.title }}</strong>
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
                    <span v-if="note.pinned" class="pin-mark">*</span>
                    <strong>{{ note.title }}</strong>
                  </div>
                </div>

                <div class="result-meta">
                  <span class="type-pill">{{ note.type }}</span>
                  <span>{{ formatRelativeDate(note.updatedAt) }}</span>
                </div>
              </div>

              <div v-if="(note.tags || []).length" class="result-tags">
                <span
                  v-for="tagId in (note.tags || []).slice(0, 3)"
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

      <section v-else :class="['screen-grid', 'editor-screen', { focused: isFocusedEditor }]">
        <article v-if="activeNote" :class="['editor-surface', { focused: isFocusedEditor }]">
          <div class="editor-topbar">
            <div class="editor-topbar-copy">
              <button class="back-link" @click="openLibrary(state.smartView)">Back to library</button>
              <div class="editor-status">
                <span>{{ wordsInActiveNote }} words</span>
                <span>{{ formatDate(activeNote.updatedAt) }}</span>
                <span class="save-indicator" :data-state="state.saveStatus">
                  {{ state.saveStatus === 'saving' ? 'Saving...' : state.saveStatus === 'typing' ? 'Editing...' : 'Saved' }}
                </span>
              </div>
            </div>

            <div class="editor-actions">
              <button class="secondary-btn" @click="toggleEditorDetails()">
                {{ state.editorDetailsOpen ? 'Close details' : 'Details' }}
              </button>
              <button class="ghost-btn danger" @click="removeCurrentNote">Delete</button>
            </div>
          </div>

          <div class="editor-main">
            <textarea
              v-model="activeNote.title"
              class="title-textarea"
              rows="2"
              placeholder="Untitled note"
            ></textarea>

            <div class="editor-toolbar" aria-label="Text formatting toolbar">
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyEditorCommand('bold')"><strong>B</strong></button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyEditorCommand('italic')"><em>I</em></button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyEditorCommand('underline')"><u>U</u></button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyBlockFormat('h1')">H1</button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyBlockFormat('h2')">H2</button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyEditorCommand('insertUnorderedList')">- List</button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyEditorCommand('insertOrderedList')">1. List</button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="insertChecklist()">Checklist</button>
              <button class="toolbar-btn" type="button" @mousedown.prevent @click="applyBlockFormat('blockquote')">Quote</button>
            </div>

            <div class="body-editor-shell">
              <div
                ref="editorBody"
                class="rich-editor"
                contenteditable="true"
                data-placeholder="Write clearly. Keep the next step obvious."
                @input="onEditorBodyInput"
                @change="onEditorCheckboxChange"
                @click="onEditorBodyClick"
              ></div>
            </div>
          </div>

          <transition name="fade">
            <div
              v-if="state.editorDetailsOpen"
              class="editor-details-layer"
              @click.self="toggleEditorDetails(false)"
            >
              <aside class="editor-details-panel">
                <div class="details-head">
                  <div>
                    <p class="eyebrow">Note details</p>
                    <h3>{{ activeNote.title || 'Untitled note' }}</h3>
                  </div>
                  <button class="micro-btn" @click="toggleEditorDetails(false)">Close</button>
                </div>

                <div class="sidecar-block">
                  <p class="eyebrow">Properties</p>
                  <div class="details-stack">
                    <select v-model="activeNote.type" class="type-select">
                      <option v-for="type in noteTypes" :key="type" :value="type">{{ type }}</option>
                    </select>
                    <button class="secondary-btn" @click="togglePin">{{ activeNote.pinned ? 'Unpin note' : 'Pin note' }}</button>
                    <span class="meta-faint">Created {{ formatDate(activeNote.createdAt) }}</span>
                    <span class="meta-faint">Updated {{ formatDate(activeNote.updatedAt) }}</span>
                  </div>
                </div>

                <div class="sidecar-block">
                  <p class="eyebrow">Note tags</p>
                  <div v-if="state.tags.length" class="tag-toggle-grid">
                    <button
                      v-for="tag in state.tags"
                      :key="tag.id"
                      :class="['tag-toggle', { active: (activeNote.tags || []).includes(tag.id) }]"
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
          </transition>
        </article>

        <article v-else class="surface-card empty-editor">
          <p class="eyebrow">Nothing selected</p>
          <h3>Open a note or capture a new one.</h3>
          <p>The editor appears here once you choose a note from the library.</p>
          <button class="primary-btn" @click="openLibrary()">Browse notes</button>
        </article>
      </section>
    </main>

    <nav v-if="!isFocusedEditor" class="mobile-nav">
      <button :class="{ active: state.screen === 'home' }" @click="state.screen = 'home'">Home</button>
      <button :class="{ active: state.screen === 'library' }" @click="openSearch()">Search</button>
      <button :class="{ active: state.screen === 'library' }" @click="openLibrary()">Notes</button>
      <button :class="{ active: state.screen === 'editor' }" @click="state.activeNoteId ? state.screen = 'editor' : openLibrary()">Editor</button>
    </nav>
  </div>

  <div v-else class="loading-screen">
    <p>Loading Ledger...</p>
  </div>
</template>
