# Vis Lokaties

Deze versie van Vis Lokaties draait volledig als statische HTML/CSS/JS met een lichte PHP-API voor opslag. Daardoor kan de site
zonder Node.js op XAMPP of vrijwel elke externe hosting met PHP en MySQL draaien. De installer richt automatisch de database in
en schrijft een `config.php`, zodat nieuwe omgevingen zichzelf herstellen zolang je éénmalig admin-toegang tot MySQL kunt geven.

## Structuur
- `index.html` – de kaart en interface
- `css/` – styles
- `js/` – functionaliteit
- `api/` – PHP installer/API (`db.php`, `install.php`, `bootstrap.php`, `config*.php`)
- `install.php` – alias die automatisch `api/install.php` laadt voor het geval je rechtstreeks naar `/install.php` navigeert
- `version.json` – metadata die de UI toont

## Vereisten
- PHP 8.0 of hoger met `mysqli`
- MySQL 5.7/8.0 (bijvoorbeeld de server die met XAMPP wordt geleverd)

## Functionaliteiten van de site
De interface in `index.html` bevat alle tooling voor wateren, stekken en onderwaterdata:

| Paneel | Mogelijkheden |
| --- | --- |
| **Basemap** | Wissel tussen OSM, Toner, Terrain en Carto Dark tegels, met schaalbalk, muispositie, zoomlabel en realtime diepte-tooltip (IDW-interpolatie op bathy-punten). |
| **Spots** | Voeg stekken of rigs toe door op de kaart te klikken, schakel clustering, toon automatische afstandslijnen en forceer een drag-fix wanneer Leaflet-slepen blokkeert. De knop “🤖 2 rigs per zichtbare stek” genereert voor elke zichtbare stek twee rigmarkeringen. |
| **Detectie** | Run de detector op het kaartbeeld, de huidige selectie of OpenStreetMap-wateren, stel “Max edge” in, geef de contour een naam en sla die op als water. Selecties zijn met één klik te legen. |
| **Deeper import & heatmap** | Importeer CSV/ZIP-bestanden of hele mappen (bijvoorbeeld uit Deeper), bewaar bathymetrische punten in de database, bekijk voortgangsbalken en queue-log, configureer de heatmap (radius, blur, min/max, inversie, clipping, vast bereik) met legenda/statistiek en wis heatmap of bathy-data. |
| **Weer & wind** | Haal direct het actuele weer op of kies een datum/uur, toon het resultaat in tekstvorm, teken windpijlen op de kaart en stel pijl-dichtheid in. |
| **Overzicht & beheren** | Wissel tabs voor waters, stekken en rigs om lijsten te bewerken, hernoemen of verwijderen. |
| **Contouren** | Genereer contourlijnen uit de opgeslagen bathymetrie binnen het kaartbeeld of wis bestaande contourlagen. |
| **Opschonen & export** | Exporteer alle data, importeer GeoJSON, sla of laad een snapshot via localStorage, reset browserdata en download standalone HTML-bestanden (met of zonder embedded dataset). |
| **GPS & navigatie** | Start/stop live GPS-tracking om positie, nauwkeurigheid, snelheid en koers op de kaart en in het infopaneel te tonen. |

Statusmeldingen verschijnen onderin, evenals de actuele muiscoördinaten, het zoomniveau en de app-versie (`version.json`). Alle
mutaties (wateren, stekken, rigs, bathy, settings) worden direct naar MySQL gepusht via `api/db.php`.

## Installeren op XAMPP
1. Start **Apache** en **MySQL** via het XAMPP Control Panel.
2. Plaats de inhoud van deze repository in `C:\xampp\htdocs\vis-lokaties` (bijvoorbeeld via `git clone` direct in `htdocs`).
3. Surf naar [http://localhost/vis-lokaties/install.php](http://localhost/vis-lokaties/install.php) (deze file vereist automatisch `api/install.php`). De wizard vraagt:
   - Een MySQL admin (bijv. `root` + leeg wachtwoord op een standaardinstallatie).
   - De gewenste applicatie-database (standaard `vislokaties`).
   - Een nieuw gebruikersaccount + wachtwoord dat de app gaat gebruiken.
4. De installer logt in met het admin-account, maakt database en gebruiker, kent rechten toe, zorgt dat de `kv`-tabel bestaat,
schrijft `api/config.php` en seed de default dataset.
5. Navigeer naar [http://localhost/vis-lokaties/](http://localhost/vis-lokaties/). Alle mutaties worden nu direct in MySQL opgeslagen.
> **Tip:** Het veld “Applicatie host” bepaalt vanaf welke host MySQL jouw app laat verbinden. Vul hier `localhost`, `127.0.0.1` of `::1` in op XAMPP; de installer schrijft diezelfde waarde naar `config.php` zodat MySQL geen `Access denied` geeft doordat `localhost` en `127.0.0.1` anders worden behandeld.

Start altijd via `http://localhost/...` zodat fetches naar `api/db.php` correct resolven.

## Externe hosting
1. Upload de volledige inhoud (inclusief `api/`, `css/`, `js/`, `index.html`, `install.php` en `version.json`) naar de document-root van je host (FTP/SFTP/git deploy).
2. Voer `install.php` (of direct `api/install.php`) uit via de browser. Op managed hosting heb je vaak phpMyAdmin-gegevens waarmee je tijdelijk als admin kunt inloggen; de installer doet de rest (database, gebruiker, `kv`-tabel, config-bestand).
3. Kun je geen admin-credentials krijgen? Maak dan handmatig een database en gebruiker in het hostingpaneel en vul die in `api/config.php`. Zet “Applicatie host” gelijk aan het hostpatroon dat je in het paneel hebt ingesteld (bijvoorbeeld `%`, `localhost` of de servernaam) zodat de installer dezelfde waarde voor de verbindingshost gebruikt.
4. Eventueel kun je environment-variabelen (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) gebruiken als jouw host dat ondersteunt; `config.php` is dan optioneel.
5. Zorg dat PHP 8 + `mysqli` draait en dat `api/` requests niet worden geblokkeerd. Daarna kun je dezelfde URL-structuur als lokaal aanhouden.

## Werking
- De front-end doet fetch-requests naar `api/db.php` om de volledige JSON (`waters`, `steks`, `rigs`, `bathy`, `settings`) te lezen of te schrijven.
- `api/install.php` draait dezelfde bootstrapper als `db.php`, maar met extra stappen om een database + gebruiker te provisionen en de config file neer te zetten.
- `api/bootstrap.php` bevat alle logica om `config.php` of environment-variabelen te laden, de MySQL-verbinding te maken, en de `kv`-tabel te migreren (met validaties op kolomnamen/typen).
- Bij de eerste run seed `bootstrap.php` de standaard dataset. Elke wijziging vanuit de UI (toevoegen van stekken, importeren van bathy, contouren genereren, etc.) triggert `pushDbToServer()` zodat MySQL altijd het actuele JSON-document bevat.

## Versiebeheer
- De huidige applicatieversie wordt bijgehouden in het bestand `VERSION` (root van de repository) en in `version.json`. Pas deze gelijktijdig aan bij een nieuwe release.
- De UI toont altijd de waarde uit `version.json`; het document `<title>` wordt er automatisch op aangepast.
- Wil je releases volgen? Update beide bestanden en commit ze; de front-end leest `version.json` bij het laden.

## Configuratie zonder config.php
Op sommige hosts kun je liever environment-variabelen gebruiken (bijvoorbeeld via `.htaccess` of het hostingpaneel). Ondersteunde variabelen:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Wanneer deze variabelen zijn gezet is `config.php` optioneel.
