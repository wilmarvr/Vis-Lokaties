#!/usr/bin/env bash
set -euo pipefail

remote="${1:-origin}"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if git status --porcelain | grep -q "."; then
  echo "[sync] Werkboom bevat niet-gecommitete wijzigingen. Commit eerst voordat je synchroniseert." >&2
  exit 1
fi

echo "[sync] Werkkopie schoon."

echo "[sync] PHP-bestanden linten..."
if compgen -G "api/*.php" > /dev/null; then
  for file in api/*.php; do
    php -l "$file" >/dev/null
  done
  echo "[sync] PHP-lint geslaagd."
else
  echo "[sync] Geen PHP-bestanden gevonden om te linten."
fi

if ! git remote get-url "$remote" >/dev/null 2>&1; then
  echo "[sync] Remote '$remote' ontbreekt. Voeg toe met: git remote add $remote <git-url>" >&2
  exit 1
fi

# Push all refs (branches, tags, notes) so GitHub ontvangt dezelfde inhoud als deze hoofdbron.
echo "[sync] Push lokale repository spiegel naar $remote via git push --mirror..."
git push --mirror "$remote"

echo "[sync] Volledige synchronisatie afgerond."
