# AGENTS.md

## Project Overview

This project is a local-first notes app built with Vue 3 and Vite.

- Frontend framework: Vue 3 with `<script setup>`
- Build tool: Vite
- Persistence: IndexedDB via `idb`
- Dev server port: `5195`
- Primary goal: fast daily note-taking with a premium calm UI and strong search flow
- Editor mode: focused full-screen writing view when a note is open
- Body editing: native browser rich-text editing with lightweight formatting controls
- Navigation: collapsible icon-first sidebar with hover expand on pointer devices

## Key Files

- `src/App.vue`
  Main application UI, navigation flow, search, capture, library, focused editor, save state, and draft recovery behavior.
- `src/styles.css`
  Global design system and responsive layout styles.
- `src/db.js`
  IndexedDB access layer for notes and tags.
- `INDEXEDB-DIAGRAM.md`
  Human-readable database overview and Mermaid diagram for the local IndexedDB schema.
- `README.md`
  Project overview, local setup, feature summary, and storage notes for humans.
- `package.json`
  Scripts and dependencies.
- `vite.config.js`
  Vite configuration with fixed port `5195`.

## Run Commands

- Install dependencies: `npm.cmd install`
- Start dev server: `npm.cmd run dev`
- Build for production: `npm.cmd run build`
- Preview production build: `npm.cmd run preview`

PowerShell may block `npm`, so prefer `npm.cmd` in this workspace.

## Product Direction

The app should feel:

- premium calm
- fast and uncluttered
- optimized for daily note-taking
- search-first for retrieval
- mobile-aware with adaptive layout

Avoid turning it into a generic admin dashboard or a visually noisy productivity app.

## UX Constraints

- Keep light mode only unless explicitly requested otherwise.
- Favor clear typography, spacing, and visual hierarchy over adding more UI chrome.
- Prioritize fewer clicks and faster workflows.
- Search and note-finding are primary workflows.
- Quick capture should stay structured: note type first, then title.
- The title should remain plain text.
- The note body may use lightweight rich-text formatting, but avoid turning it into a heavy block editor.
- When editing a note, prioritize a distraction-free writing surface: hide nonessential navigation and keep controls minimal.
- The main desktop navigation should stay compact, calm, and icon-legible when collapsed.
- Sticky headers and polished custom scrollbars are part of the intended experience, not optional decoration.
- Avoid browser-default looking controls when a control is part of the core product surface.

## Data Model

Keep the current local data model unless there is an explicit migration request.

### Note shape

```js
{
  id,
  title,
  type,
  body,
  tags,
  pinned,
  createdAt,
  updatedAt
}
```

Notes about `body`:

- `body` remains a string in IndexedDB.
- Existing notes may contain legacy plain text.
- Newly edited rich notes may store HTML in `body`.
- Search, preview, and word-count logic should derive plain text from stored HTML instead of rendering raw tags.

### Tag shape

```js
{
  id,
  label,
  hue,
  createdAt
}
```

## Persistence Rules

- IndexedDB is the source of truth.
- The app also uses `localStorage` as a temporary draft-recovery layer for in-progress note edits; do not treat it as the canonical store.
- Do not replace local persistence with hardcoded seed data.
- Do not add backend or sync behavior unless explicitly requested.
- Preserve existing stored notes when making UI changes.
- Do not introduce a schema migration for rich-text support unless explicitly requested.
- Be careful with save-state UX: the editor should reliably settle back to `Saved`, and refresh/navigation should not silently drop recent edits.
- If you change note persistence, keep both IndexedDB save behavior and draft-recovery behavior working together.

## Implementation Guidance

- Prefer extending the current single-app structure unless a refactor is clearly helpful.
- Keep behavior-level changes aligned with the current product direction.
- Preserve port `5195`.
- Validate significant UI changes with `npm.cmd run build`.
- If making frontend changes that affect layout or interaction, verify the running app locally when possible.
- Preserve the focused editor flow: opening a note should feel writing-first, with metadata moved behind lightweight secondary controls.
- Prefer dependency-light editor behavior unless there is a clear product need for a dedicated editor package.
- Keep the focused editor full-width within its writing canvas; avoid reintroducing narrow centered width caps unless explicitly requested.
- Preserve the current custom dropdown treatment for note-type and filter controls; opened menus should layer above nearby cards.
- Keep the sidebar sticky and hover-expand behavior aligned with the sticky main header on non-editor screens.

## What To Avoid

- Reintroducing dummy/mock note content as product data
- Changing the storage model unnecessarily
- Adding dark mode, auth, sync, or folders without a request
- Replacing the calm UI direction with a default boilerplate dashboard look

## Notes For Future Agents

- This workspace is a git repository.
- The extracted `unzipped` folder contains the original prototype reference and can be used for inspiration, but the active app lives in `src/`.
