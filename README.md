# Vis Lokaties

Deze versie van Vis Lokaties draait volledig als statische HTML/CSS/JS met een lichte PHP-API voor opslag. Daardoor kan de site zonder Node.js op XAMPP of vrijwel elke externe hosting met PHP en MySQL draaien.

## Structuur
- `public/index.html` – de kaart en interface
- `public/css/` – styles
- `public/js/` – functionaliteit
- `public/api/db.php` – API-endpoint dat leest/schrijft in MySQL

## Vereisten
- PHP 8.0 of hoger met `mysqli`
- MySQL 5.7/8.0 (bijvoorbeeld de server die met XAMPP wordt geleverd)

## Installeren op XAMPP
1. Start **Apache** en **MySQL** via het XAMPP Control Panel.
2. Maak in [http://localhost/phpmyadmin](http://localhost/phpmyadmin) een database aan, bijvoorbeeld `vis_lokaties`.
3. Kopieer de map `public` uit deze repository naar `C:\xampp\htdocs\vis-lokaties` (of gebruik een git clone direct in `htdocs`).
4. Kopieer `public/api/config.example.php` naar `public/api/config.php` en vul jouw MySQL host, gebruikersnaam, wachtwoord en database in.
5. Navigeer naar [http://localhost/vis-lokaties/](http://localhost/vis-lokaties/) – de kaart laadt nu data uit MySQL via `api/db.php`.

## Externe hosting
1. Upload de volledige `public` map naar de document-root van je hosting (bijvoorbeeld via FTP).
2. Maak een MySQL database + gebruiker aan via het hostingpaneel.
3. Zet de juiste gegevens in `public/api/config.php` (of gebruik environment-variabelen `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` als jouw host dat toestaat).
4. Zorg dat PHP-bestanden (vooral `public/api/db.php`) schrijfbaar zijn voor de webserver zodat deze verbinding kan maken met MySQL.

## Werking
- De front-end doet fetch-requests naar `api/db.php`.
- Het PHP-script maakt de tabel `kv` automatisch aan (mocht deze nog niet bestaan) en bewaart alle kaartdata in één JSON document onder de sleutel `lv_db_main`.
- Bij de eerste run wordt de standaard dataset opgeslagen. Daarna wordt iedere wijziging die je in de interface maakt automatisch naar MySQL geschreven.

## Configuratie zonder config.php
Op sommige hosts kun je liever environment-variabelen gebruiken (bijvoorbeeld via `.htaccess` of het hostingpaneel). Ondersteunde variabelen:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Wanneer deze variabelen zijn gezet is `config.php` optioneel.
