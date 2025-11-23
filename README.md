# Vis Lokaties (v0.0.0)

Vis Lokaties is een moderne herbouw van het oorspronkelijke bestand **“Vis lokaties 1.1.4-d.html”** met dezelfde kaartenworkflow, uitgebreide bathymetrie-imports en persistente opslag in de browser (localStorage). De toepassing is volledig meertalig (Nederlands/Engels), werkt zonder bundler en kan als statische site of op XAMPP worden geplaatst.

## Belangrijkste mogelijkheden

### Kaartbediening & selectie
- Leaflet-kaart met vier basemaps, GPS-tracking, clustering en themaschakeling vanuit de toolbar.【F:index.html†L17-L90】
- Klikmodi voor wateren, stekken en rigs, sleepbare markers, automatische koppeling op basis van nabijheid en handmatig polygon-tekenen voor wateren.【F:index.html†L92-L188】【F:assets/js/map.js†L95-L210】【F:assets/js/map.js†L808-L990】
- Instelbare zijbalkbreedte en herschikbare panelen zodat de interface zich aan verschillende schermen aanpast.【F:index.html†L86-L188】【F:assets/js/ui.js†L12-L118】
- Diepte- en detectietelemetrie in de footer met IDW-tool, afstandslijnen en contourgeneratie.【F:index.html†L264-L329】【F:assets/js/map.js†L436-L621】【F:assets/js/map.js†L1183-L1364】

### Data-import & bathymetrie
- CSV-, ZIP-, map- en GeoJSON-import met wachtrij, voortgangsbalk, deduplicatie en automatische heatmaprendering.【F:index.html†L189-L274】【F:assets/js/data.js†L90-L370】【F:assets/js/data.js†L690-L986】
  - Bathymetrieopsplitsing in batches, quota-bewaking en optionele opslag in de lokale browserdatabase.【F:assets/js/data.js†L1022-L1380】
- Heatmapinstellingen (radius, blur, min/max, invert, clip) en contourlaag gebaseerd op Turf.js.【F:index.html†L214-L252】【F:assets/js/map.js†L1183-L1364】

### Detectie & waterbeheer
- Detectie van viewport, selectiecirkel en OSM-water (met Overpass fallback), inclusief naam-prompts en automatische opslag als waterobject.【F:index.html†L239-L270】【F:assets/js/map.js†L333-L435】【F:assets/js/data.js†L470-L646】
- Handmatig water tekenen via kaartprikken, dubbelklik-afronding en beheer vanuit de tabs.【F:assets/js/map.js†L808-L990】【F:assets/js/ui.js†L210-L318】

### Beheer, koppelingen & vangsten
- Overzichtstabellen voor waters/stekken/rigs met hernoemen, verwijderen en dropdowns om koppelingen aan te passen; toolbar-summary toont hiërarchische relaties.【F:index.html†L331-L433】【F:assets/js/ui.js†L56-L208】【F:assets/js/ui.js†L320-L468】
  - Vangstenpaneel met foto-upload; de gegevens blijven in de browseropslag en foto’s worden lokaal opgeslagen in de `uploads/`-map wanneer je die exporteert of back-upt.【F:assets/js/data.js†L1382-L1706】

### Weer, admin & versiebeheer
- Weerpaneel met datum/uur-keuze, dichtheid, overlay-toggle en pijllagen.【F:index.html†L435-L520】【F:assets/js/weather.js†L38-L210】
  - Adminpagina voor autosync, bathy-voorkeuren en releasebeheer (`version.json`) zonder databaseconfiguratie; alles wordt in je browserprofiel opgeslagen.【F:admin.html†L15-L110】【F:assets/js/admin.js†L32-L220】【F:data/version.json†L1-L10】
- Versie blijft op **v0.0.0** totdat klaar voor release; beheer gebeurt via admin of direct in `data/version.json`.【F:admin.html†L17-L77】【F:data/version.json†L1-L10】

## Directory-overzicht

| Pad | Inhoud |
| --- | --- |
| `index.html` | Hoofdapp, UI-layout, modulair scriptloader en Leaflet-integratie.【F:index.html†L1-L520】 |
| `admin.html` | Zelfstandig beheerpaneel voor database- en versieconfiguratie.【F:admin.html†L1-L132】 |
| `assets/css/` | Thema’s voor licht/donker + admin-styling.【F:assets/css/style-dark.css†L1-L620】【F:assets/css/style-light.css†L1-L620】 |
| `assets/js/` | Modules (`core`, `map`, `data`, `ui`, `weather`, `admin`, `db`, `i18n`, `helpers`).【F:assets/js/core.js†L1-L350】 |
| `assets/vendor/osmtogeojson.js` | Gebundelde Overpass-converter (fallback op eigen parsing).【F:assets/vendor/osmtogeojson.js†L1-L2】 |
| `api/` | Legacy PHP-endpoints (niet vereist voor lokale opslag); bewaarbaar voor eigen hostinguitbreidingen. |
| `data/` | Persistente JSON-state + versie-informatie.【F:data/state.json†L1-L9】【F:data/version.json†L1-L10】 |
| `lang/` | Nederlands/Engels vertalingen voor het volledige UI.【F:lang/nl.json†L1-L401】【F:lang/en.json†L1-L401】 |
| `docs/` | Projectinventaris, herstelpunten en GitHub-sync-handleiding.【F:docs/project_inventory.md†L1-L106】【F:docs/restore_points.md†L1-L39】【F:docs/sync_github.md†L1-L98】 |
| `scripts/` | Sync-helpers en herstelpunt-script (`create_restore_point.sh`).【F:scripts/sync_github.sh†L1-L40】【F:scripts/sync_github_full.sh†L1-L35】【F:scripts/create_restore_point.sh†L1-L45】 |
| `uploads/` | Uploadmap voor vangstfoto’s (webserver schrijfrechten vereist). |

## Installatie & gebruik (statische hosting of XAMPP)

1. **Benodigdheden**
   - Een eenvoudige webserver om ES-modules te serveren (bijv. `npx serve`, XAMPP/Apache, nginx). File:// opent vaak niet door modulebeperkingen.
   - Browser met ES modules ondersteuning (Chrome, Firefox, Edge).

2. **Plaatsing**
   - Kopieer de repo naar je webroot, bijv. `C:\xampp\htdocs\vislokaties` of `/var/www/vislokaties`, of start een statische server vanuit de projectmap.
   - `uploads/` blijft beschikbaar voor handmatige foto-export of back-ups; applicatiedata (waters/stekken/rigs/imports/vangsten) staat in de browseropslag.

3. **Werking**
   - Start de hoofdapp via `index.html`.
   - Gebruik het **Data / Analyse**-paneel voor imports; punten worden lokaal bewaard en in de heatmap getoond.【F:index.html†L189-L247】【F:assets/js/data.js†L1022-L1380】
   - Nieuwe stekken/rigs koppelen automatisch aan dichtbijzijnde water/stek en kunnen in het beheerpaneel worden aangepast.【F:assets/js/data.js†L422-L646】【F:assets/js/ui.js†L56-L208】
   - Vangsten toevoegen via het **Vangsten**-paneel; gegevens blijven lokaal, foto’s kun je handmatig in `uploads/` bewaren of exporteren.【F:assets/js/data.js†L1382-L1706】

4. **Admin & versiebeheer**
   - Beheer bathy-voorkeuren, autosync en releases op de adminpagina; alles wordt direct in de lokale opslag geplaatst.【F:admin.html†L15-L110】【F:assets/js/admin.js†L32-L220】
   - Het project blijft op versie **0.0.0** totdat een nieuwe release wordt opgeslagen.【F:data/version.json†L1-L10】

## Data-import workflow

1. Kies **Import CSV/ZIP** of **Import map**; beide sturen bestanden naar de wachtrij en tonen live-progress in `importQueue` en de legacy teller (`impCount`, `impPctAll`).【F:index.html†L189-L238】【F:assets/js/data.js†L189-L370】
2. CSV-parser detecteert scheidingstekens, herkent kolomnamen (zoals “GPS (Lat)”) en haalt alleen lat/lon/diepte op.【F:assets/js/data.js†L736-L986】
3. ZIP-imports worden uitgepakt met JSZip; elke CSV wordt als aparte taak verwerkt.【F:assets/js/data.js†L986-L1120】
4. Na verwerking worden heatmap en importoverlay bijgewerkt; bij een actief databasevinkje wordt `save_import.php` aangeroepen om data server-side op te slaan.【F:assets/js/data.js†L1122-L1380】【F:api/save_import.php†L1-L69】
5. De importgeschiedenis verdwijnt zodra de wachtrij leeg is, maar de statusnotitie blijft beschikbaar voor feedback.【F:assets/js/data.js†L360-L420】

## Lokalisatie & thema’s

- Alle teksten hebben `data-i18n`-keys; `i18n.js` laadt `lang/nl.json` of `lang/en.json` en wisselt dynamisch bij taalverandering.【F:index.html†L1-L120】【F:assets/js/i18n.js†L1-L37】【F:lang/nl.json†L1-L401】
- Licht/donker thema’s worden via `style-light.css` en `style-dark.css` toegepast en zijn afgestemd op zowel hoofd- als adminpagina.【F:assets/css/style-dark.css†L1-L620】【F:assets/css/style-light.css†L1-L620】

## Versiebeheer

- Versie-informatie staat in `data/version.json` en wordt bij het starten geladen voor weergave in header en adminpagina.【F:assets/js/core.js†L28-L120】【F:data/version.json†L1-L10】
- Het project blijft bewust op **v0.0.0**; gebruik het adminpaneel om release-notities voor toekomstige versies voor te bereiden.【F:admin.html†L17-L115】

## Herstelpunten

- Maak een lokaal herstelpunt met `./scripts/create_restore_point.sh`; het script legt een `restore-YYYYMMDD-HHMMSS`-branch vast en schrijft een archief onder `backups/` voor snelle terugrol.【F:scripts/create_restore_point.sh†L1-L45】
- Raadpleeg `docs/restore_points.md` voor terugzet- en opschoontips rond deze snapshots.【F:docs/restore_points.md†L1-L39】

## Synchronisatie naar GitHub

- **Hoofdbron**: deze map is leidend; GitHub-repo’s fungeren als mirror.
- **Scripts**: gebruik `scripts/sync_github.sh <remote> <branch>` voor één branch of `scripts/sync_github_full.sh <remote>` voor volledige mirrors.【F:scripts/sync_github.sh†L1-L40】【F:scripts/sync_github_full.sh†L1-L35】
- **Workflow**: via `.github/workflows/mirror-to-branch.yml` kan je ook vanuit de GitHub UI synchroniseren zonder lokale terminal.【F:.github/workflows/mirror-to-branch.yml†L1-L43】
- Volg de handleiding in `docs/sync_github.md` voor details en checklist.【F:docs/sync_github.md†L1-L98】

## Testen & linten

- Backend: `for f in api/*.php; do php -l "$f"; done`
- Frontend modules: `node --check assets/js/*.js`
- Scripts voeren deze checks automatisch uit vóór synchronisatie.【F:scripts/sync_github.sh†L7-L32】

## Voorbeelddata

- De meegeleverde `depth_map_data (2).csv` bootst een Deeper-export na voor importtests.【F:'depth_map_data (2).csv'†L1-L2723】
- Voeg eigen CSV-/ZIP-bestanden toe in de webroot om grotere datasets te testen; `.gitignore` voorkomt dat zware archieven per ongeluk meegecommit worden.【F:.gitignore†L1-L3】

## Licentie & herkomst

- Dit project is een herbouw van het originele “Vis lokaties 1.1.4-d.html” en bevat aangepaste iconen en UI.
- Externe bibliotheken: Leaflet, Leaflet.markercluster, Leaflet.heat, JSZip en Turf.js worden via CDN geladen.【F:index.html†L17-L39】

Voor aanvullende details over individuele bestanden of synchronisatie, raadpleeg `docs/project_inventory.md` en `docs/sync_github.md`.
