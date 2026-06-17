#!/usr/bin/env bash
#
# josiah-release.sh — bump the version, build, and publish a GitHub release
# that BRAT can install on iPad / mobile.
#
# Usage:
#   ./scripts/josiah-release.sh [patch|minor|major|<x.y.z>] [options]
#   npm run release -- [patch|minor|major|<x.y.z>] [options]
#
#   bump arg   (default: patch)
#     patch | minor | major   semver bump from current manifest.json version
#     <x.y.z>                  set an explicit version (must be valid semver)
#
#   options
#     --notes "text"   custom release notes (default: auto-generated)
#     --no-push        skip git commit+push; tag the current HEAD as-is
#     --dry-run        print what would happen, change/publish nothing
#
# Examples:
#   ./scripts/josiah-release.sh                 # patch bump + release
#   ./scripts/josiah-release.sh minor           # minor bump + release
#   ./scripts/josiah-release.sh 0.5.0           # explicit version
#   npm run release -- patch --dry-run
#
set -euo pipefail

# Always operate from the repo root regardless of where it's called from.
cd "$(dirname "$0")/.."

BUMP="patch"
NOTES=""
DO_PUSH=1
DRY_RUN=0

# --- parse args -------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    patch|minor|major) BUMP="$1"; shift ;;
    --notes) NOTES="${2:-}"; shift 2 ;;
    --no-push) DO_PUSH=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *)
      # Treat anything else as an explicit version (validated below).
      BUMP="$1"; shift ;;
  esac
done

log()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight --------------------------------------------------------------
command -v node >/dev/null || die "node not found"
command -v gh   >/dev/null || die "gh (GitHub CLI) not found — install with: brew install gh"
gh auth status >/dev/null 2>&1 || die "Not logged in to GitHub. Run: gh auth login"

CUR=$(node -p "require('./manifest.json').version")

# --- compute new version ----------------------------------------------------
case "$BUMP" in
  patch|minor|major)
    NEW=$(node -e "process.stdout.write(require('semver').inc('$CUR','$BUMP') || '')")
    ;;
  *)
    NEW=$(node -e "const s=require('semver');const v=s.valid('$BUMP');if(!v)process.exit(1);process.stdout.write(v)") \
      || die "Invalid version: '$BUMP' (expected patch|minor|major or x.y.z)"
    node -e "const s=require('semver');process.exit(s.gt('$NEW','$CUR')?0:1)" \
      || die "New version $NEW is not greater than current $CUR"
    ;;
esac
[ -n "$NEW" ] || die "Failed to compute new version"

# Derive owner/repo from the `origin` remote (NOT gh's default-repo resolution,
# which can point at the upstream parent of a fork). Handles https and ssh URLs.
ORIGIN_URL=$(git remote get-url origin)
REPO=$(printf '%s' "$ORIGIN_URL" | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
[ -n "$REPO" ] || die "Could not parse owner/repo from origin: $ORIGIN_URL"
BRANCH=$(git branch --show-current)

log "Repo:    $REPO"
log "Branch:  $BRANCH"
log "Version: $CUR -> $NEW"
gh release view "$NEW" --repo "$REPO" >/dev/null 2>&1 && die "Release/tag $NEW already exists on $REPO"

if [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] Would bump manifest.json, manifest-beta.json, versions.json to $NEW"
  log "[dry-run] Would run: npm run build"
  [ "$DO_PUSH" -eq 1 ] && log "[dry-run] Would commit + push the version bump to $BRANCH"
  log "[dry-run] Would create release $NEW on $REPO with main.js, manifest.json, styles.css"
  exit 0
fi

# --- bump version in all the files that track it ----------------------------
log "Bumping version files to $NEW"
node -e '
  const fs = require("fs");
  const v = process.argv[1];
  for (const f of ["manifest.json", "manifest-beta.json"]) {
    const m = JSON.parse(fs.readFileSync(f, "utf8"));
    m.version = v;
    fs.writeFileSync(f, JSON.stringify(m, null, "\t") + "\n");
  }
  // versions.json maps plugin version -> minAppVersion (Obsidian convention)
  const minApp = JSON.parse(fs.readFileSync("manifest.json", "utf8")).minAppVersion;
  const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
  versions[v] = minApp;
  fs.writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
' "$NEW"

# --- build ------------------------------------------------------------------
log "Building (npm run build)"
npm run build

for f in dist/main.js dist/manifest.json dist/styles.css; do
  [ -f "$f" ] || die "Expected build artifact missing: $f"
done

# --- commit + push the bump so the tag points at the right commit -----------
if [ "$DO_PUSH" -eq 1 ]; then
  log "Committing + pushing version bump"
  git add manifest.json manifest-beta.json versions.json
  git commit -m "Release $NEW" >/dev/null 2>&1 || log "Nothing to commit (files unchanged)"
  git push origin "$BRANCH"
  TARGET_ARGS=(--target "$BRANCH")
else
  log "Skipping git commit/push (--no-push); tagging current HEAD"
  TARGET_ARGS=()
fi

# --- publish the GitHub release (assets are what BRAT reads) -----------------
if [ -z "$NOTES" ]; then
  NOTES="Automated release $NEW of ObsidianInk-TranscriptionFork.

Install / update on iPad via BRAT using: https://github.com/$REPO
Assets read by BRAT: main.js, manifest.json, styles.css"
fi

log "Creating GitHub release $NEW on $REPO"
gh release create "$NEW" \
  dist/main.js dist/manifest.json dist/styles.css \
  --repo "$REPO" \
  --title "ObsidianInk-TranscriptionFork $NEW" \
  --notes "$NOTES" \
  "${TARGET_ARGS[@]}"

printf '\033[32m✓ Released %s — BRAT will pick it up on next update.\033[0m\n' "$NEW"
