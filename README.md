# Vis Lokaties

Deze versie van Vis Lokaties draait als kleine Node.js-app. De front-end is opgesplitst in losse HTML/CSS/JS bestanden en synchroniseert automatisch met een SQLite-database via Express endpoints.

## Installatie
1. Installeer Node.js 18 of hoger.
2. Voer `npm install` uit om de dependencies op te halen.

## Ontwikkelserver starten
```
npm start
```

De kaart is daarna bereikbaar op [http://localhost:3000](http://localhost:3000). Alle wijzigingen in de kaart worden automatisch naar `server/data.sqlite` geschreven.
