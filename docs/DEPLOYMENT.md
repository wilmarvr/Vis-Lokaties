# Deployment & hosting checklist

Deze gids helpt je om Vis Lokaties op een standaard hostingpakket of VPS te plaatsen zonder extra buildstap.

## 1. Serververeisten

| Component | Aanbevolen | Waarom |
| --- | --- | --- |
| PHP | 8.1 of hoger | Alle API-endpoints gebruiken typed properties en `enum`-achtige checks die in PHP 8+ beschikbaar zijn. |
| Database | SQLite 3 | `api/db.php` maakt automatisch tabellen (`waters`, `stekken`, `rigs`, `catches`, `bathy_*`). |
| Webserver | Apache/Nginx met HTTPS | Nodig voor ES-modules via `index.html` en veilige upload van vangstfoto's. |
| Node (optioneel) | 18+ | Alleen nodig als je `scripts/sync_github*.sh` of toekomstige bundlers wilt draaien. |

### Bestandsrechten
- `/api/config.local.json` en `/data/*.json` moeten lees/schrijfbaar zijn door PHP zodat instellingen en versie-informatie opgeslagen kunnen worden.
- `/uploads/` moet **write**-rechten krijgen voor foto-uploads (`uploads/catches/`).

## 2. Structuur uploaden

1. Kopieer de volledige map naar de webroot (`/var/www/vis-lokaties` of `~/domains/.../public_html`).
2. Zorg dat `index.html`, `assets/`, `lang/` en `data/` publiek leesbaar zijn.
3. Laat `/api/` bereikbaar onder dezelfde host (bv. `https://voorbeeld.nl/vislok/api/list_spots.php`).
4. Houd `scripts/` en `docs/` optioneel buiten de public root als je alleen de webapp serveert.

## 3. Configuratie op afstand

1. Surf naar `https://<host>/vis-lokaties/admin.html`.
2. Vul het pad naar het SQLite-bestand in (bijv. `data/vislok.sqlite`) en klik op **Opslaan**. Dit schrijft `api/config.local.json`.
3. Hosting zonder schrijfrechten? Zet de omgevingsvariabele `VISLOK_DB_PATH`; deze wordt vóór `config.local.json` toegepast.
4. Gebruik **Test verbinding** om direct te zien of het bestand bereikbaar is; bij de eerste succesvolle call maakt `api/db.php` automatisch de tabellen aan.
5. Ga naar `index.html` en controleer of de kaart data kan laden; bij de eerste succesvolle call maakt `api/db.php` automatisch de tabellen aan.

## 4. Modules & performance

- De frontend draait volledig op ES-modules (`assets/js/core.js`, `map.js`, `data.js`, `ui.js`, `weather.js`, `helpers.js`, `i18n.js`). Er is geen bundler nodig; hosting kan de bestanden ongewijzigd serveren.
- Elke module heeft zijn eigen versie-query (`?v=20250611`) zodat browsers simpel cachen en je toch cache-busting behoudt na updates.
- Om de laadprestaties te verbeteren kun je statische assets via een CDN of `Cache-Control: max-age=31536000` laten serveren.
- Als je features wilt opsplitsen, kun je modules lazy-loaden door alleen de benodigde scripts in `index.html` te importeren. De huidige structuur ondersteunt dit al doordat elk onderdeel (`map`, `data`, `ui`, `weather`) zelfstandig exporteert.

## 5. CI/CD en hostingworkflow

- Gebruik `scripts/sync_github.sh <remote> <branch>` om wijzigingen richting GitHub te duwen en daarna vanuit GitHub naar je hosting te deployen.
- Op shared hosting kun je via SFTP of rsync alleen `index.html`, `assets/`, `api/`, `data/`, `lang/` en `uploads/` uploaden; andere mappen zijn optioneel.
- Maak vóór een deploy een herstelpunt met `scripts/create_restore_point.sh` zodat je altijd kan terugrollen.

## 6. Checklist vóór livegang

- [ ] `admin.html` toont een groen vinkje bij **Test verbinding**.
- [ ] `uploads/catches/` heeft schrijfpermissies en toont geen directory listing.
- [ ] `data/version.json` bevat de release info die je in de header wilt tonen.
- [ ] Kaart kan zoomen/pannen, markers zijn versleepbaar en API's (`list_spots.php`, `save_spot.php`, `save_catch.php`) geven HTTP 200 terug.
- [ ] HTTPS actief zodat GPS en geolocatie in de browser werken.

Met deze stappen kan het project zonder extra refactor op een hostingpakket draaien; modules en functies blijven netjes gescheiden zodat je eenvoudig features kunt uitschakelen of uitbreiden.
