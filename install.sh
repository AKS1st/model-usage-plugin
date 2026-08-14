#!/usr/bin/env bash
# Install the musage-stats (model usage statistics) plugin into the current DSH web profile.
# Idempotent: re-running only refreshes the package files and keeps the patch row.
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="$DSH_HOME/profiles/web"
PKG="$PROFILE/node_modules/musage-stats"
PATCH="$PROFILE/cordis.patch.yml"

if [ ! -d "$PROFILE" ]; then
  echo "error: web profile not found at $PROFILE (is DSH_HOME correct?)" >&2
  exit 1
fi

# 1. Package files
mkdir -p "$PKG"
cp package.json index.js client.js "$PKG/"
echo "installed package files -> $PKG"

# 2. Patch row (insert block, appended only if missing)
if [ -f "$PATCH" ] && grep -qE '^\s{2,}- id: musage-stats([[:space:]]|$)' "$PATCH"; then
  echo "patch row already present in $PATCH"
else
  INSERT_BLOCK='- insert:
    - id: musage-stats
      name: musage-stats
'
  if [ ! -f "$PATCH" ] || [ ! -s "$PATCH" ] || grep -qE '^\s*\[\s*\]\s*$' "$PATCH"; then
    cat > "$PATCH" <<YAML
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).

$INSERT_BLOCK
YAML
  else
    printf '\n%s' "$INSERT_BLOCK" >> "$PATCH"
  fi
  echo "added patch row to $PATCH"
fi

cat <<'NOTE'

Done. Notes for this plugin:

- The patch row applies live via the profile's config-only HMR (no restart
  needed for the row itself).
- Browser UI (client.js) is served fresh from disk — a page refresh picks up
  changes.
- HOST code changes (index.js) require a dsh web process restart to take
  effect (the web bundle uses config-only HMR without module reloading).
- Stats, prices, and balance config persist to $DSH_HOME/musage-stats.json.
  The balance API key is kept in session memory only (never written to disk).
NOTE
