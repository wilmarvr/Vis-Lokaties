# Restorepoints & snapshots

Gebruik dit document om snel een herstelpunt te maken voordat je grotere wijzigingen doorvoert. De repository blijft de hoofdbron; GitHub-mirrors en andere kopieën kunnen hiernaar verwijzen.

## Herstelpunt aanmaken

1. Zorg dat je alle gewenste wijzigingen hebt opgeslagen (committen is niet verplicht).
2. Voer in de projectmap het script uit:

   ```bash
   ./scripts/create_restore_point.sh
   ```

3. Het script maakt:
   - Een lokale branch `restore-YYYYMMDD-HHMMSS` die naar de huidige `HEAD` wijst.
   - Een gecomprimeerd archief in `backups/vis-lokaties-YYYYMMDD-HHMMSS.tar.gz` met dezelfde inhoud.

4. De branch en het archief blijven lokaal beschikbaar totdat je ze verwijdert.

## Terugrollen naar een herstelpunt

*Via Git branch*

```bash
git checkout restore-YYYYMMDD-HHMMSS
```

*Via het archief*

1. Pak het `.tar.gz`-bestand uit de map `backups/` uit in een lege directory.
2. Kopieer de bestanden terug naar je werkmap of open de snapshot in een nieuwe Git-werkdir.

## Opschonen

- Verwijder branches die je niet meer nodig hebt met `git branch -D <branchnaam>`.
- Verwijder oude archieven door de bestanden in `backups/` te wissen.

> **Tip:** Maak een herstelpunt na elke grotere wijziging zodat je altijd kunt terugvallen op een bekende, werkende versie.
