import { openDB } from 'idb'

const DB_NAME = 'ledger-notes-db'
const DB_VERSION = 1
const NOTES_STORE = 'notes'
const TAGS_STORE = 'tags'

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    const notes = db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
    notes.createIndex('updatedAt', 'updatedAt')
    notes.createIndex('pinned', 'pinned')
    notes.createIndex('type', 'type')

    const tags = db.createObjectStore(TAGS_STORE, { keyPath: 'id' })
    tags.createIndex('label', 'label')
  },
})

export async function seedIfEmpty() {
  await dbPromise
}

export async function getNotes() {
  const db = await dbPromise
  const notes = await db.getAll(NOTES_STORE)
  return notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export async function getTags() {
  const db = await dbPromise
  const tags = await db.getAll(TAGS_STORE)
  return tags.sort((a, b) => a.label.localeCompare(b.label))
}

export async function saveNote(note) {
  const db = await dbPromise
  const timestamp = new Date().toISOString()
  const next = {
    ...note,
    title: note.title?.trim() || 'Untitled note',
    body: note.body ?? '',
    tags: Array.isArray(note.tags) ? note.tags : [],
    updatedAt: timestamp,
    createdAt: note.createdAt || timestamp,
  }
  await db.put(NOTES_STORE, next)
  return next
}

export async function deleteNote(id) {
  const db = await dbPromise
  await db.delete(NOTES_STORE, id)
}

export async function saveTag(tag) {
  const db = await dbPromise
  const next = {
    id: tag.id || crypto.randomUUID(),
    label: tag.label.trim(),
    hue: Number.isFinite(tag.hue) ? tag.hue : 210,
    createdAt: tag.createdAt || new Date().toISOString(),
  }
  await db.put(TAGS_STORE, next)
  return next
}

export async function deleteTag(tagId) {
  const db = await dbPromise
  const tx = db.transaction([TAGS_STORE, NOTES_STORE], 'readwrite')
  await tx.objectStore(TAGS_STORE).delete(tagId)

  const notes = await tx.objectStore(NOTES_STORE).getAll()
  for (const note of notes) {
    if (note.tags.includes(tagId)) {
      note.tags = note.tags.filter((id) => id !== tagId)
      note.updatedAt = new Date().toISOString()
      await tx.objectStore(NOTES_STORE).put(note)
    }
  }

  await tx.done
}
