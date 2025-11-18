# GitHub synchronisatiehandleiding

Deze repository in `/workspace/Vis-Lokaties` is de hoofdbron. Gebruik onderstaande stappen om een downstream GitHub-repository hieraan te spiegelen.

## 1. Werkdirectory controleren
1. Open een terminal in de projectmap.
2. Controleer de status:
   ```bash
   git status -sb
   ```
   Zorg dat er geen niet-gecommitte wijzigingen zijn voordat je gaat syncen.
3. Als je liever alles in één commando doet, kun je `scripts/sync_github.sh` of `scripts/sync_github_full.sh` gebruiken (zie hoofdstuk 5).

## 2. Laatste wijzigingen ophalen
1. Als je met een bestaand GitHub-remote werkt, haal dan de laatste geschiedenis op voor referentie:
   ```bash
   git fetch origin
   ```
2. Vergelijk indien nodig met de gewenste branch (bijv. `main`):
   ```bash
   git diff origin/main
   ```

## 3. Testen uitvoeren
Voer dezelfde controles uit als in deze hoofdbron. Standaard controleren we de PHP-endpoints:
```bash
for f in api/*.php; do php -l "$f"; done
```
Breid dit uit met extra tests als je backend of frontend logic aanpast.

## 4. Commit maken
1. Voeg nieuwe of gewijzigde bestanden toe:
   ```bash
   git add -A
   ```
2. Maak een commit met een duidelijke boodschap, bijvoorbeeld:
   ```bash
   git commit -m "Sync hoofdbron naar GitHub"
   ```

## 5. Push naar GitHub
### Optie A – script
1. Zorg dat je remote bestaat, bijvoorbeeld `origin`:
   ```bash
   git remote add origin <git-url>
   # overslaan als de remote al bestaat
   ```
2. Voer het sync-script uit (standaard remote `origin`, branch `main`):
   ```bash
   ./scripts/sync_github.sh
   ```
   Je kunt een andere remote/branch meegeven:
   ```bash
   ./scripts/sync_github.sh upstream production
   ```
   Wil je naar een nieuwe featurebranch pushen, gebruik dan dezelfde vorm:
   ```bash
   ./scripts/sync_github.sh origin feature/deeper-import-rework
   ```
   Het script gebruikt `git push --set-upstream`, waardoor je lokale branch direct gekoppeld wordt aan de nieuw aangemaakte GitHub-branch.

3. Volledige mirror (alle branches/tags) nodig? Gebruik het full-script:
   ```bash
   ./scripts/sync_github_full.sh        # gebruikt remote 'origin'
   ./scripts/sync_github_full.sh mirror # andere remote
   ```
   Dit script voert een `git push --mirror` uit en zorgt ervoor dat GitHub exact dezelfde refs en bestandsinhoud heeft als deze hoofdbron.

### Optie B – GitHub Actions (geen terminal nodig)
1. Open de GitHub-repository in je browser en ga naar **Actions → Mirror to GitHub branch**.
2. Klik op **Run workflow** en vul de gewenste doelbranch in (standaard `mirror`).
3. Laat de optie *Force push* op `true` staan als de branch volledig overschreven mag worden.
4. Bevestig met **Run workflow**; de actie pusht de huidige hoofdbron naar de gekozen branch met behulp van de `GITHUB_TOKEN`-machtiging.

### Optie C – handmatig
1. Controleer de remotes:
   ```bash
   git remote -v
   ```
   Voeg zo nodig toe met `git remote add origin <git-url>`.
2. Push naar de gewenste branch (bijv. `main`):
   ```bash
   git push origin main
   ```

## 6. Controle na push
1. Controleer op GitHub of de commit en bestanden zichtbaar zijn.
2. Herhaal `git status -sb` lokaal om te bevestigen dat alles schoon is.

## 7. Inventaris raadplegen
Gebruik `docs/project_inventory.md` als checklist om te verifiëren dat GitHub alle relevante bestanden bevat en dat er geen overbodige items zijn achtergebleven.

## 8. Downstream cleanup
Indien GitHub overtollige bestanden bevat die niet meer in de hoofdbron staan:
1. Verwijder ze lokaal (`git rm <bestand>`), commit en push opnieuw.
2. Verifieer in de GitHub UI dat de bestanden zijn verdwenen.

Door deze stappen consequent te volgen blijft GitHub een exacte mirror van deze hoofdbron.
