# Installing Ink on iPad (via Obsidian Sync)

This is a personal note for installing this **custom build** of the Ink plugin (the `transcribe_using_ai` branch) onto Obsidian on your iPad.

The catch: **you can't build the plugin on the iPad.** iOS has no Node.js/npm and no real filesystem access for Obsidian's plugin folder. So the iPad has to *receive* an already-built plugin. There are two ways to do that:

- **Option A — Build on a computer, deliver via Obsidian Sync.** Best fit since you have Sync. Needs a Mac/PC with this repo once.
- **Option B — BRAT (no computer needed).** Installs straight from a GitHub release on the iPad, but only works if this branch is published as a release/tag on a GitHub repo you control.

---

## Option A — Build on computer → sync to iPad (recommended)

### 1. Build the plugin (on your Mac/PC, in this repo)

```bash
npm install        # first time only
npm run build      # type-checks, then bundles into ./dist
```

This produces a `./dist` folder containing the three files Obsidian actually needs:

- `main.js`
- `manifest.json`
- `styles.css`

### 2. Copy the build into your vault's plugin folder (on the computer)

The plugin id is **`obsidianink-transcription-fork`**, so the target folder is:

```
<YourVault>/.obsidian/plugins/obsidianink-transcription-fork/
```

Copy `main.js`, `manifest.json`, and `styles.css` from `dist/` into that folder (create the `obsidianink-transcription-fork` folder if it doesn't exist).

> Because the id is distinct from the official Ink plugin, this installs as its own separate plugin and won't conflict with (or share settings with) official Ink.

> `.obsidian` is a hidden folder. On macOS press **Cmd+Shift+.** in Finder to reveal it.

### 3. Turn on plugin syncing in Obsidian Sync

On the **computer**, in Obsidian:

1. **Settings → Sync**
2. Under **Selective sync**, enable **Installed community plugins** (this is what carries the plugin files to the iPad). Optionally also enable **Core/Community plugin settings** so your Ink settings travel too.
3. Wait for sync to finish (watch the sync status in the bottom corner).

> Obsidian does **not** sync plugins by default — this toggle is the whole trick.

### 4. Enable it on the iPad

On the **iPad**, once sync has pulled the files down:

1. **Settings → Community plugins** → make sure community plugins are turned on (toggle off **Restricted/Safe mode** if prompted).
2. You should see **ObsidianInk-TranscriptionFork** in the installed list. Toggle it **on**.
3. If it doesn't appear, fully close and reopen Obsidian (swipe it away from the app switcher) to force a re-scan, then check again.

### Updating later

Re-run `npm run build` on the computer, recopy the three files into `.obsidian/plugins/obsidianink-transcription-fork/`, let Sync push them, then on the iPad **disable and re-enable** the plugin (or restart Obsidian) so it reloads the new `main.js`.

---

## Option B — BRAT (install on iPad with no computer)

BRAT (Beta Reviewer's Auto-update Tool) installs plugins directly from a GitHub release, entirely on the iPad. Use this if you've pushed this branch to a GitHub repo of your own **and created a release** whose assets include `main.js`, `manifest.json`, and `styles.css` (the same three files `npm run build` produces).

On the **iPad**:

1. **Settings → Community plugins → Browse**, search and install **BRAT**, then enable it.
2. **Settings → BRAT → Add Beta Plugin.**
3. Enter the GitHub repo URL for *your* fork (e.g. `https://github.com/JosiahBORG/obsidian_ink`).
4. BRAT downloads the latest release and installs it; enable **ObsidianInk-TranscriptionFork** under Community plugins.

To update: BRAT auto-updates beta plugins on startup, or run BRAT's command **"Choose a single plugin to update"** and pick ObsidianInk-TranscriptionFork.

### Cutting a release with one command

Instead of building and uploading by hand, use the release script (`scripts/josiah-release.sh`). It bumps the version, builds, pushes, and publishes the GitHub release that BRAT installs from — all in one go:

```bash
npm run release                 # patch bump (e.g. 0.3.4 -> 0.3.5) + release
npm run release -- minor        # minor bump (0.3.4 -> 0.4.0)
npm run release -- major        # major bump (0.3.4 -> 1.0.0)
npm run release -- 0.5.0        # set an exact version
npm run release -- patch --dry-run   # preview only — nothing is changed or published
```

It updates `manifest.json`, `manifest-beta.json`, and `versions.json`, runs `npm run build`, commits & pushes the bump, then creates the GitHub release with `main.js` / `manifest.json` / `styles.css` attached. On the iPad, BRAT picks it up on its next startup (or run BRAT's **"Check for updates to all beta plugins"** command).

One-time setup before first use: install and log in to the GitHub CLI —

```bash
brew install gh
gh auth login        # GitHub.com -> HTTPS -> browser, with push access to your fork
```

> Note: BRAT pulls from GitHub *releases*, not just a branch — you must attach the built files to a release/tag. The repo's `npm run beta-release` script tags a `<version>-beta` release for this purpose.

---

## Which should I use?

- **Just testing your own builds quickly** → **Option A**. You're already iterating on the code on a computer, and Sync is the least-friction delivery channel.
- **Want over-the-air updates without touching a computer each time** → **Option B** (after the one-time effort of publishing releases on your fork).

## Troubleshooting

- **ObsidianInk-TranscriptionFork doesn't show up on iPad:** confirm "Installed community plugins" is enabled in Sync settings *on the computer*, wait for sync to complete, then restart Obsidian on the iPad.
- **Shows up but won't enable:** community plugins / safe mode must be turned on in **Settings → Community plugins** on the iPad.
- **Old version keeps loading after an update:** Obsidian caches the running plugin — disable/re-enable the plugin, or restart the app, after new files sync.
- **Stylus lag while writing:** expected on iOS after a few hundred strokes — see the README's "Optimisation Notes". The plugin hides old strokes while writing; they reappear when the drawing freezes or the file reopens.
