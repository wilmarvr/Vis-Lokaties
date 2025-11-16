# Vis Lokaties

Deze versie van Vis Lokaties draait als kleine Node.js-app. De front-end is opgesplitst in losse HTML/CSS/JS bestanden en synchroniseert automatisch met een MySQL-database via Express endpoints.

## Vereisten
- Node.js 18 of hoger
- Een MySQL 8.x server (bijv. via XAMPP)

## MySQL instellen met XAMPP
1. Start **Apache** en **MySQL** in het XAMPP Control Panel.
2. Open [http://localhost/phpmyadmin](http://localhost/phpmyadmin) en maak een database aan, bijvoorbeeld `vis_lokaties`.
3. Maak eventueel een aparte gebruiker aan (tabblad *Privileges*) of gebruik de standaard `root`-gebruiker. Geef de gebruiker volledige rechten op de nieuwe database.
4. Pas indien gewenst de verbindingsgegevens aan via omgevingsvariabelen:
   - `DB_HOST` (standaard `127.0.0.1`)
   - `DB_PORT` (standaard `3306`)
   - `DB_USER` (standaard `root`)
   - `DB_PASSWORD` (standaard leeg)
   - `DB_NAME` (standaard `vis_lokaties`)

De server maakt bij het opstarten automatisch de tabel `kv` aan en vult deze met de standaard dataset als deze nog leeg is.

## Installatie
1. Installeer Node.js.
2. Voer `npm install` uit om de dependencies op te halen.

## Ontwikkelserver starten
```
npm start
```

De kaart is daarna bereikbaar op [http://localhost:3000](http://localhost:3000). Alle wijzigingen in de kaart worden automatisch naar de MySQL-database geschreven.
