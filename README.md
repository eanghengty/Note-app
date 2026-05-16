# Ledger Notes

Ledger is a local-first notes app built with Vue 3 and Vite for fast daily note-taking, search-first retrieval, and a calm writing experience.

## What It Does

- quick capture with note type first, then title
- search-first library with smart views and tag filtering
- focused full-screen editor for writing
- lightweight rich-text note body with native browser editing
- collapsible icon-first sidebar with hover expansion on pointer devices
- local persistence with IndexedDB plus temporary draft recovery

## Tech Stack

- Vue 3 with `<script setup>`
- Vite
- IndexedDB via `idb`

## Local Setup

Use `npm.cmd` in this workspace because PowerShell may block plain `npm`.

```powershell
npm.cmd install
npm.cmd run dev
```

App URL during development:

- `http://localhost:5195`

## Available Commands

```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

## Current UX Shape

- Home, Library, and Editor live in a single app shell.
- The main sidebar is compact by default and expands on hover for pointer devices.
- On touch-style environments, the sidebar stays expanded by default instead of depending on hover.
- The note editor hides the sidebar entirely so writing stays distraction-free.
- The main header and editor header are sticky during scroll.
- Core controls such as dropdowns, modals, and scrollbars are custom-styled to match the app.

## Data Storage

Primary storage:

- IndexedDB database: `ledger-notes-db`
- Object stores: `notes`, `tags`

Draft recovery:

- `localStorage` is used as a temporary draft backup layer for in-progress note edits
- IndexedDB remains the source of truth

Note body behavior:

- `body` is still a string
- legacy notes may contain plain text
- newer edited notes may contain HTML rich-text content

See [INDEXEDB-DIAGRAM.md](C:\Users\Hengty(Jack)Eang\OneDrive - SkyAus Infrastructure Pty Ltd\Desktop\Self Induction\Claude app\Note app\INDEXEDB-DIAGRAM.md) for the schema overview.

## Project Files

- [src/App.vue](C:\Users\Hengty(Jack)Eang\OneDrive - SkyAus Infrastructure Pty Ltd\Desktop\Self Induction\Claude app\Note app\src\App.vue): main UI, editor flow, sidebar behavior, save state, and dialogs
- [src/styles.css](C:\Users\Hengty(Jack)Eang\OneDrive - SkyAus Infrastructure Pty Ltd\Desktop\Self Induction\Claude app\Note app\src\styles.css): layout, design system, sticky surfaces, dropdowns, and scrollbar styling
- [src/db.js](C:\Users\Hengty(Jack)Eang\OneDrive - SkyAus Infrastructure Pty Ltd\Desktop\Self Induction\Claude app\Note app\src\db.js): IndexedDB access layer
- [AGENTS.md](C:\Users\Hengty(Jack)Eang\OneDrive - SkyAus Infrastructure Pty Ltd\Desktop\Self Induction\Claude app\Note app\AGENTS.md): agent-specific implementation guidance

## Validation

For UI changes, validate with:

```powershell
npm.cmd run build
```
