# Projectbestandsoverzicht

Dit document geeft een momentopname (commit) van alle projectbestanden die in de repository staan. Gebruik dit als referentie om te controleren of jouw lokale werkkopie identiek is aan de hoofdbron.

## Topniveau

- `README.txt`
- `Vis lokaties 1.1.4-d.html`
- `index.html`
- `admin.html`
- `favicon.ico`
- `depth_map_data (2).csv`
- `api/`
- `assets/`
- `data/`
- `docs/`
- `lang/`
- `scripts/`
- `uploads/`

## API (PHP)

- `api/config.php`
- `api/db.php`
- `api/list_spots.php`
- `api/save_spot.php`
- `api/delete_spot.php`
- `api/reset_spots.php`
- `api/list_imports.php`
- `api/save_import.php`
- `api/clear_imports.php`
- `api/get_config.php`
- `api/save_config.php`
- `api/get_version.php`
- `api/save_version.php`
- `api/version_store.php`
- `api/test_connection.php`
- `api/list_catches.php`
- `api/save_catch.php`
- `api/delete_catch.php`

Alle PHP-scripts gebruiken `api/db.php` en maken automatisch de benodigde tabellen aan wanneer ze via XAMPP worden aangeroepen.

## Assets

### CSS
- `assets/css/style-dark.css`
- `assets/css/style-light.css`

### JavaScript
- `assets/js/core.js`
- `assets/js/map.js`
- `assets/js/ui.js`
- `assets/js/data.js`
- `assets/js/db.js`
- `assets/js/helpers.js`
- `assets/js/weather.js`
- `assets/js/admin.js`

### Afbeeldingen & vendor
- `assets/img/` (faviconset, logo’s)
- `assets/vendor/osmtogeojson.js`

## Data en documentatie

- `data/state.json`
- `data/version.json`
- `data/changelog.json`
- `data/database.sql`
- `data/function_map.json`
- `docs/README_PUBLIC.md`
- `docs/project_inventory.md` *(dit bestand)*
- `docs/sync_github.md`
- `.github/workflows/mirror-to-branch.yml`
- `uploads/.gitkeep`

## Configuratie

- `api/config.local.json` *(optioneel, genegeerd door git – wordt via adminpaneel aangemaakt)*

## Scripts

- `scripts/sync_github.sh` *(stelt upstream automatisch in tijdens push)*
- `scripts/sync_github_full.sh`

## Talen

- `lang/nl.json`
- `lang/en.json`

## Opmerkingen

- De repository bevat geen grote Deeper-voorbeeldarchieven. Voeg eigen CSV/ZIP-bestanden lokaal toe voor tests.
- De huidige projectversie blijft ingesteld op **0.0.0**. Pas dit bestand aan wanneer je naar een volgende release promoveert.
- Controleer met `git status` dat er geen lokale wijzigingen of niet-getrackte bestanden zijn voordat je wijzigingen deelt.

