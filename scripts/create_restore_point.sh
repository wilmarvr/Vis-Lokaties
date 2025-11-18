#!/usr/bin/env bash
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "[restore-point] git is required" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[restore-point] run this script inside the repository" >&2
  exit 1
fi

status=$(git status --porcelain)
if [[ -n "$status" ]]; then
  echo "[restore-point] Warning: working tree has uncommitted changes" >&2
fi

timestamp=$(date +%Y%m%d-%H%M%S)
branch="restore-${timestamp}"
archive_dir="backups"
archive_name="vis-lokaties-${timestamp}.tar.gz"

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "[restore-point] Branch ${branch} already exists" >&2
  exit 1
fi

commit=$(git rev-parse HEAD)
git branch "$branch" "$commit"

echo "[restore-point] Created branch ${branch} at ${commit}" >&2

mkdir -p "$archive_dir"
if git archive --format=tar.gz -o "${archive_dir}/${archive_name}" HEAD; then
  echo "[restore-point] Snapshot written to ${archive_dir}/${archive_name}" >&2
else
  echo "[restore-point] Failed to create archive" >&2
fi

echo "[restore-point] To restore: git checkout ${branch}" >&2
