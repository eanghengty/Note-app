# AGENTS.md

## Project Overview

This project is a local-first notes app built with Vue 3 and Vite.

- Frontend framework: Vue 3 with `<script setup>`
- Build tool: Vite
- Persistence: IndexedDB via `idb`
- Dev server port: `5195`
- Primary goal: fast daily note-taking with a premium calm UI and strong search flow

## Key Files

- `src/App.vue`
  Main application UI, navigation flow, search, capture, library, and editor behavior.
- `src/styles.css`
  Global design system and responsive layout styles.
- `src/db.js`
  IndexedDB access layer for notes and tags.
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
- The editor should remain polished plain-text, not a heavy block editor or full rich-text system unless explicitly requested.

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
- Do not replace local persistence with hardcoded seed data.
- Do not add backend or sync behavior unless explicitly requested.
- Preserve existing stored notes when making UI changes.

## Implementation Guidance

- Prefer extending the current single-app structure unless a refactor is clearly helpful.
- Keep behavior-level changes aligned with the current product direction.
- Preserve port `5195`.
- Validate significant UI changes with `npm.cmd run build`.
- If making frontend changes that affect layout or interaction, verify the running app locally when possible.

## What To Avoid

- Reintroducing dummy/mock note content as product data
- Changing the storage model unnecessarily
- Adding dark mode, auth, sync, or folders without a request
- Replacing the calm UI direction with a default boilerplate dashboard look

## Notes For Future Agents

- This workspace is not currently a git repository, so do not rely on `git diff` or `git status`.
- The extracted `unzipped` folder contains the original prototype reference and can be used for inspiration, but the active app lives in `src/`.
