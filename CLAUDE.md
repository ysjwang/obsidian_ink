# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Ink** is an [Obsidian](https://obsidian.md) plugin (manifest id `obsidianink-transcription-fork`; this is a fork of the upstream `ink` plugin, display name **ObsidianInk-TranscriptionFork**) that lets users hand write or draw with a stylus directly between paragraphs in their notes. It is built on the [tldraw](https://tldraw.dev/) v2 framework, which provides an infinite canvas and stroke input, rendered inside React.

Note on licensing: although the repo is public, it is **not open source** — it is licensed CC BY-NC-ND 4.0. Contributions require the CLA in [docs/CLA.md](docs/CLA.md).

## Commands

```bash
npm run dev      # esbuild watch build -> ./dist (use during development)
npm run build    # type-check (tsc -noEmit) then production esbuild bundle
npm test         # run all Jest tests
npx jest src/utils/parseFilepath.test.ts   # run a single test file
```

There is no lint script wired into npm; ESLint config lives in `.eslintrc` (run `npx eslint src` if needed).

### Build output & local install
The bundle is written to `./dist` (gitignored). esbuild copies `manifest.json` / `manifest-beta.json` into `dist`, renames `main.css` → `styles.css`, and copies `src/static/**` — all of which Obsidian expects. To test in a real vault, point the build output (or symlink `dist`) at `<vault>/.obsidian/plugins/obsidianink-transcription-fork/` (the folder name must match the manifest `id`). The compiled `main.js` is never committed; releases are uploaded to GitHub releases via the tag-based release scripts in `scripts/`.

### Releases
`npm run internal-release` / `beta-release` / `public-release` are thin wrappers over git tagging in `scripts/*.sh` (e.g. beta pushes a `<version>-beta` tag). `npm version` runs `version-bump.mjs` to sync `manifest.json` + `versions.json`.

#### Fork release (BRAT-installable) — `npm run release`
This fork ships to iPad/mobile via [BRAT](https://github.com/TfTHacker/obsidian42-brat), which installs from a GitHub **release's assets**. [scripts/josiah-release.sh](scripts/josiah-release.sh) automates the whole cycle in one command (safe for both humans and AI to run):

```bash
npm run release                 # patch bump (default) -> build -> commit/push -> GitHub release
npm run release -- minor        # or major / patch / an explicit x.y.z
npm run release -- 0.5.0 --dry-run   # preview without changing or publishing anything
npm run release -- patch --no-push   # tag current HEAD; skip the version-bump commit/push
```

What it does: computes the next semver from `manifest.json`, writes it into `manifest.json` + `manifest-beta.json` + `versions.json`, runs `npm run build`, commits & pushes the bump to the current branch, then `gh release create`s a release whose assets are `dist/{main.js,manifest.json,styles.css}` (the three files BRAT reads). The release **tag must equal the manifest `version`** or BRAT rejects it — the script guarantees this.

Requirements: `gh` authenticated (`gh auth login`) with push access. The target repo is derived from the **`origin`** remote (intentionally not `gh`'s default-repo resolution, which points at the upstream fork parent). BRAT then installs/updates from `https://github.com/<origin-owner>/obsidian_ink`.

## Architecture

### Plugin entry & feature gating
[src/main.ts](src/main.ts) — the `InkPlugin` class (default export) is the single entry point. On load it registers icons and conditionally wires up **two independent features** based on settings flags `writingEnabled` and `drawingEnabled`. Each feature registers three things: a **View**, an **embed code-block processor**, and **editor commands**. Settings are loaded/saved via Obsidian's `loadData`/`saveData` (`PluginSettings` in [src/types/plugin-settings.ts](src/types/plugin-settings.ts)).

### Two parallel feature pipelines: Writing and Drawing
The codebase is deliberately **mirrored** across two modes. Almost every concept exists in both a `writing-*` and a `drawing-*` form (views, embeds, commands, menus, tldraw editors, file extensions). When changing behavior, check whether the change applies to both pipelines.

| Concept | Writing | Drawing |
|---|---|---|
| File extension | `.writing` (`WRITE_FILE_EXT`) | `.drawing` (`DRAW_FILE_EXT`) |
| Embed code-block key | `handwritten-ink` (`WRITE_EMBED_KEY`) | `handdrawn-ink` (`DRAW_EMBED_KEY`) |
| View | `src/views/writing-view.tsx` | `src/views/drawing-view.tsx` |
| tldraw editor | `src/tldraw/writing/` | `src/tldraw/drawing/` |

### File format (the `.writing` / `.drawing` files)
These are JSON files (not raw tldraw). The shape is `InkFileData` in [src/utils/page-file.ts](src/utils/page-file.ts):
- `meta` — plugin/tldraw version, `previewIsOutdated`, optional `transcript`.
- `tldraw` — a `TLEditorSnapshot` (the actual stroke data).
- `previewUri` — a cached SVG/PNG preview of the strokes.

Always build/serialize these through `buildWritingFileData` / `buildDrawingFileData` / `stringifyPageData` rather than hand-constructing JSON. Read them via `getInkFileData`.

### Embeds vs. Views — two ways the same file is shown
1. **View** (`writing-view.tsx`, `drawing-view.tsx`): full-screen editor when you open a `.writing`/`.drawing` file directly. Extends Obsidian's `TextFileView`; mounts a React root running the tldraw editor. **Important:** `clear()` unmounts the React root — this is required so old files don't save their data over a newly opened file.
2. **Embed** (`src/extensions/widgets/*-embed-widget.tsx`): how strokes appear *inside* a markdown note. Implemented as a fenced code block (e.g. ```` ```handwritten-ink ````) whose body is JSON (`WritingEmbedData` / `DrawingEmbedData` in [src/utils/embed.ts](src/utils/embed.ts)) pointing at the `.writing`/`.drawing` file via `filepath`. Registered with `registerMarkdownCodeBlockProcessor`.

The embed code-block format is a known limitation (see README "Embed Format Notes"): files are only visible while the plugin is installed. Build embed strings with `buildWritingEmbed` / `buildDrawingEmbed`, never by hand.

### Embed lifecycle: preview ⇄ live editor
An embed does **not** run the heavy tldraw editor by default. It renders a lightweight cached **preview** (the `previewUri` from the file), and only mounts the live tldraw editor on interaction. State machine is `WritingEmbedState` in `src/tldraw/writing/writing-embed.tsx`: `preview → loadingEditor → editor → loadingPreview`. State is shared via **Jotai** atoms (`embedStateAtom`, `editorActiveAtom`, `previewActiveAtom`); each embed is wrapped in its own `<JotaiProvider>`. When the editor "freezes" back to preview it re-renders the strokes to an SVG/PNG (`src/utils/screenshots.ts`, canvg) and writes it back as `previewUri`, marking `previewIsOutdated`.

### Performance constraint (read before touching stroke rendering)
tldraw renders strokes as SVG, which lags badly on iOS after ~200–300 strokes. The plugin mitigates this by **hiding strokes that are several lines old while actively writing** (still saved; they reappear on freeze/reopen). Relevant constants: `WRITE_STROKE_LIMIT`, `WRITE_SHORT_DELAY_MS`, `WRITE_LONG_DELAY_MS` in [src/constants.ts](src/constants.ts). The long-term plan is to move writing off tldraw onto a Canvas renderer.

### State management
- **Jotai** — per-embed/editor UI state (embed lifecycle, active editor).
- **Redux Toolkit** ([src/logic/stores.ts](src/logic/stores.ts)) — a small global session store; currently just `activeEmbedId` (which embed is in live-edit mode, so only one is active at a time).

### Transcription / OCR (focus of the `transcribe_using_ai` branch)
Handwriting → text transcription is **stubbed and not yet implemented**. The flow exists as scaffolding:
- `src/utils/fetchTranscript.ts` → `fetchTranscriptIfNeeded()` gates on `needsTranscriptUpdate()` ([src/utils/needsTranscriptUpdate.ts](src/utils/needsTranscriptUpdate.ts), currently hardcoded to return `false`).
- `src/logic/ocr-service.ts` → `fetchWriteFileTranscript()` returns a placeholder string.
- The transcript is stored on `InkFileData.meta.transcript` and saved via `saveWriteFileTranscript` (currently writes a hardcoded `"The new transcript"`).
This is where AI-based transcription work belongs.

### File/attachment paths
Where `.writing`/`.drawing` files are created is configurable (settings: `customAttachmentFolders`, `noteAttachmentFolderLocation`, subfolders default `Ink/Writing`, `Ink/Drawing`). Path logic lives in `src/utils/` (`getBaseAttachmentPath`, `getSubfolderPaths`, `parseFilepath`, `file-manipulation`, `createFoldersForFilepath`) — most of these have colocated `*.test.ts` unit tests, and they are the only meaningfully unit-tested part of the codebase.

## Conventions
- TypeScript + React (`jsx: react`, classic runtime — `import * as React`). Imports use the `src/...` absolute base (`baseUrl: "."`).
- Styles are SCSS, bundled by esbuild's sass plugin and imported directly into TS/TSX files.
- `obsidian`, `electron`, and `@codemirror/*` are external (provided by the Obsidian runtime), not bundled.
- Logging goes through `src/utils/log-to-console.ts` (`debug` / `verbose`), not raw `console.log`.
- Files use a `////////` separator comment between the import block and the body — a stylistic convention throughout `src/`.
