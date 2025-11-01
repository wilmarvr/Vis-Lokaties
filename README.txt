=======================================================
Vis Lokaties – v0.1.0 (detectie + database)
=======================================================
Modulaire herbouw van het oorspronkelijke project
Vis Lokaties 1.1.4-d.

STRUCTUUR:
 index.html
 assets/
   css/
     style-dark.css
     style-light.css
   js/
     core.js
     map.js
     ui.js
     data.js
     db.js
     helpers.js
     weather.js
   img/
     (icoontjes en logo’s)
 data/
   state.json
   changelog.json
   database.sql
   function_map.json
 api/
   config.php
   db.php
   list_spots.php
   save_spot.php
   delete_spot.php
   reset_spots.php
 lang/
   nl.json
   en.json
 docs/
   README_PUBLIC.md

THEMA & UI:
- Standaard: donker, licht thema via 🌗 knop
- Nieuwe panelen voor detectie, beheer en weer-output

DATABASE (XAMPP):
- Maak een MySQL database `vis_lokaties`
- Pas credentials aan in `api/config.php`
- Plaats de repo onder de XAMPP webroot zodat `/api/*.php` bereikbaar is
- Tabellen worden automatisch aangemaakt bij de eerste call

VERSIE:
- 0.1.0 = detectie/herbouw + MySQL synchronisatie
- Toekomstige versies: 0.2.0+, 1.0.0, etc.
