#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/pull_from_github.sh [repo_url] [branch] [path]

repo_url - HTTPS URL to the GitHub repository (default: https://github.com/wilmarvr/vis-lokaties.git)
branch   - branch to fetch (default: main)
path     - optional path relative to repo root. When omitted the entire repo (except .git) is synced over the current tree.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

REPO_URL=${1:-https://github.com/wilmarvr/vis-lokaties.git}
BRANCH=${2:-main}
TARGET_PATH=${3:-}

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to pull from GitHub" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if ! git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR"; then
  echo "Failed to clone $REPO_URL (branch $BRANCH). Ensure the network allows outbound HTTPS." >&2
  exit 1
fi

if [[ -n "$TARGET_PATH" ]]; then
  if [[ ! -e "$TMP_DIR/$TARGET_PATH" ]]; then
    echo "Path '$TARGET_PATH' not found in $REPO_URL#$BRANCH" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$TARGET_PATH")"
  cp -R "$TMP_DIR/$TARGET_PATH" "$TARGET_PATH"
else
  rsync -a --delete --exclude '.git' "$TMP_DIR/" ./
fi

echo "Pulled ${TARGET_PATH:-entire repository} from $REPO_URL#$BRANCH"
