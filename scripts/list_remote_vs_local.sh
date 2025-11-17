#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/list_remote_vs_local.sh [repo_url] [branch] [local_dir]

repo_url  - HTTPS URL to the GitHub repository (default: https://github.com/wilmarvr/vis-lokaties.git)
branch    - branch to inspect (default: main)
local_dir - local directory to compare (default: current working tree)

The script prints three sections:
1. The remote repository tree (relative paths).
2. The local tree (relative paths).
3. Differences (files only in remote / only in local).
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

REPO_URL=${1:-https://github.com/wilmarvr/vis-lokaties.git}
BRANCH=${2:-main}
LOCAL_DIR=${3:-.}

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to pull from GitHub" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

REMOTE_LIST=$(mktemp)
LOCAL_LIST=$(mktemp)

if ! git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR" >/dev/null 2>&1; then
  echo "Failed to clone $REPO_URL (branch $BRANCH). Ensure the network allows outbound HTTPS." >&2
  echo "Falling back to printing only the local tree at $LOCAL_DIR." >&2
  ( cd "$LOCAL_DIR" && find . -mindepth 1 -print | sed 's|^\./||' | sort ) > "$LOCAL_LIST"
  echo "== Local tree: $LOCAL_DIR =="
  cat "$LOCAL_LIST"
  exit 1
fi

( cd "$TMP_DIR" && find . -mindepth 1 -print | sed 's|^\./||' | sort ) > "$REMOTE_LIST"
( cd "$LOCAL_DIR" && find . -mindepth 1 -print | sed 's|^\./||' | sort ) > "$LOCAL_LIST"

echo "== Remote tree: $REPO_URL#$BRANCH =="
cat "$REMOTE_LIST"

echo "\n== Local tree: $LOCAL_DIR =="
cat "$LOCAL_LIST"

echo "\n== Only in remote =="
comm -23 "$REMOTE_LIST" "$LOCAL_LIST" || true

echo "\n== Only in local =="
comm -13 "$REMOTE_LIST" "$LOCAL_LIST" || true
