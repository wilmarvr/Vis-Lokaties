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
2. Kopieer de map `public` uit deze repository naar `C:\xampp\htdocs\vis-lokaties` (of gebruik een git clone direct in `htdocs`).
3. Open [http://localhost/vis-lokaties/api/install.php](http://localhost/vis-lokaties/api/install.php) en vul éénmalig de MySQL administrator-gebruiker (bijv. `root`), een gewenste databasenaam en een nieuwe applicatiegebruiker + wachtwoord in. De wizard maakt database, tabellen en `public/api/config.php` automatisch.
4. Navigeer naar [http://localhost/vis-lokaties/](http://localhost/vis-lokaties/) – de kaart laadt nu data uit MySQL via `api/db.php`.

## Externe hosting
1. Upload de volledige `public` map naar de document-root van je hosting (bijvoorbeeld via FTP).
2. Als jouw host phpMyAdmin of CLI-toegang heeft, kun je eveneens `api/install.php` draaien zodat het script de database + gebruiker voor je aanmaakt. Heb je geen admin-credentials, maak dan handmatig een database/gebruiker aan via het hostingpaneel en vul de gegevens in `public/api/config.php`.
3. Alternatief: zet de juiste gegevens in `public/api/config.php` (of gebruik environment-variabelen `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` als jouw host dat toestaat).
4. Zorg dat PHP-bestanden (vooral `public/api/db.php`) leesbaar zijn voor de webserver zodat deze verbinding kan maken met MySQL.

## Werking
- De front-end doet fetch-requests naar `api/db.php`.
- `api/install.php` vraagt een MySQL-beheerder, maakt (indien nodig) de database, applicatiegebruiker + wachtwoord aan en schrijft de configuratie weg.
- `db.php` controleert vervolgens bij ieder verzoek of de database-tabel `kv` nog de juiste structuur heeft en repareert die automatisch indien nodig.
- Bij de eerste run wordt de standaard dataset opgeslagen. Daarna wordt iedere wijziging die je in de interface maakt automatisch naar MySQL geschreven.

## Versiebeheer
- De huidige applicatieversie wordt bijgehouden in het bestand `VERSION` (root van de repository) en in `public/version.json`. Pas deze gelijktijdig aan bij een nieuwe release.
- De UI toont altijd de waarde uit `public/version.json`; het document `<title>` wordt er automatisch op aangepast.

## Configuratie zonder config.php
Op sommige hosts kun je liever environment-variabelen gebruiken (bijvoorbeeld via `.htaccess` of het hostingpaneel). Ondersteunde variabelen:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Wanneer deze variabelen zijn gezet is `config.php` optioneel.
