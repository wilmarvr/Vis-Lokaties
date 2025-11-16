# Vis Lokaties

The Vis Lokaties toolkit now runs through a PHP entry point (`index.php`) that renders the HTML/CSS/JS interface and refuses to load when MySQL is unavailable. A lightweight PHP API powers data persistence so the project works on XAMPP and on almost any external hosting plan that offers PHP + MySQL. The installer provisions the database, grants permissions, seeds all domain tables (`waters`, `steks`, `spots`, `bathy_points`, `bathy_datasets`, `settings`, legacy `kv`) and writes `api/config.php`, so every deployment can repair itself as long as you can temporarily supply MySQL admin credentials.

## Repository layout
- `index.php` – user interface, version banner and database readiness check
- `css/` – stylesheets (including the modal styles that power the pickers)
- `js/` – split JavaScript modules (`utils`, `state`, `map-core`, `water-manager`, `spot-manager`, `deeper-import`, `app`)
- `api/` – PHP bootstrapper, database API, installer (`db.php`, `install.php`, `bootstrap.php`, `config*.php`) and the tile proxy (`tile.php`)
- `install.php` – convenience alias that forwards to `api/install.php`
- `version.json` – metadata surfaced inside the UI and `<title>`
- `VERSION` – repository level version string (currently `v0.0.0`)

## Requirements
- PHP 8.0+ with `mysqli`
- MySQL 5.7/8.0 (the MySQL server included in XAMPP works fine)
- A browser that supports modern ES6 syntax (Chrome, Edge, Firefox, Safari)

## Feature overview
`index.php` exposes every tool in one sidebar. Each panel is now fully English:

| Panel | What it does |
| --- | --- |
| **Basemap** | Switch between OSM, Toner, Terrain and Carto Dark tiles. Tiles are proxied through `api/tile.php`, so browsers that apply OpaqueResponseBlocking no longer block the PNG/JPG requests. The panel also shows a scale bar, mouse position, zoom level and a live depth tooltip interpolated from your bathymetry. |
| **Spots** | Place swims (stekken) or rigs by clicking the map, toggle clustering, display swim–rig distances, disable clustering when dragging misbehaves and auto-place two rigs for each visible swim. Rig placement now asks which swim to link to, keeps that relationship as you drag markers around and automatically keeps the swim ↔ water pairing intact. |
| **Detection** | Build new waters from the viewport, a manual selection or OpenStreetMap water polygons. Set the maximum edge length, enter a name and store the polygon. Quickly clear the current selection. |
| **Deeper import & heatmap** | Import CSV/ZIP files or whole directories (for example from Deeper sonar logs), stream the parsed points into MySQL in large batches so uploads finish as fast as before, monitor the queue/progress bars, tune the heatmap radius/blur/min-max/inversion/clipping and wipe the heatmap or stored bathy points. The heatmap now disappears automatically whenever the database holds zero bathymetry rows, so a fresh install or a cleared table never shows stale overlays. |
| **Weather & wind** | Fetch live weather or a specific day/hour via Open-Meteo, display the result textually, render a compass overlay and optionally draw wind arrows whose density you control. |
| **Manage everything** | Tabbed tables for waters, swims and rigs so you can rename, relink or delete entries. Clicking a row zooms the map to the corresponding geometry. |
| **Contours** | Generate contour lines directly from the Deeper bathymetry (even freshly imported data) inside the current viewport, monitor the live progress bar while isolines are built, or clear existing contour layers. |
| **Clean-up & export** | Export all data, import GeoJSON, save/load/reset browser snapshots, and download standalone HTML bundles (with or without embedded JSON). |
| **GPS & navigation** | Start or stop live GPS logging to show latitude, longitude, accuracy, speed and bearing in the floating info panel. |

A small preload shim maps Leaflet's legacy `touchleave` listeners to pointer/mouse alternatives on browsers that never implemented the event (Firefox, desktop Safari), so the console no longer fills with “wrong event specified” warnings while dragging markers with a mouse. The same shim now supplies pointer-friendly stand-ins for `mozPressure`/`mozInputSource`, which suppresses Firefox's “use PointerEvent.pressure” deprecation spam.

Status updates land in the footer, together with the mouse lat/lon, zoom level and app version (from `version.json`). Every edit (waters, swims, rigs, bathy, settings) is pushed to MySQL through `api/db.php` so the database always stays authoritative. On each page load the API confirms that the database and all tables exist and silently re-creates them when something is missing.

If the configured database cannot be reached, `index.php` surfaces a blocking error overlay with the connection details so you can launch `install.php` or fix `api/config.php` before any JavaScript tries to fetch data.

## Installing on XAMPP
1. Start **Apache** and **MySQL** inside the XAMPP Control Panel.
2. Clone or copy the repository into `C:\xampp\htdocs\vis-lokaties`.
3. Browse to [http://localhost/vis-lokaties/install.php](http://localhost/vis-lokaties/install.php). The wizard asks for:
   - A MySQL admin user (e.g. `root` with an empty password on stock XAMPP).
   - The database name (default `vislokaties`).
   - A new app user + password.
   - The host value that MySQL expects (use `localhost`, `127.0.0.1` or `::1` – match whatever host your MySQL grants target).
4. The installer logs in with the admin account, creates the database and user, grants privileges, verifies the entire schema (waters, steks, spots, Deeper import tables, settings, legacy `kv`), writes `api/config.php` and seeds the default records.
5. Visit [http://localhost/vis-lokaties/](http://localhost/vis-lokaties/) and start working. All edits are now persisted inside MySQL.

Always open the site via `http://localhost/...` on XAMPP so every `fetch` call to `api/db.php` resolves correctly.

## Deploying to external hosting
1. Upload the entire repository (including `api/`, `css/`, `js/`, `install.php`, `index.php`, `version.json`) to your document root using FTP/SFTP/git.
2. Run `install.php` (or `api/install.php`) in the browser. On managed hosting you typically have phpMyAdmin credentials you can temporarily supply; the installer provisions the rest.
3. If the host does not allow temporary admin credentials, create the database + user manually in the hosting control panel and copy those values into `api/config.php`. Set the "Application host" field in the installer to exactly the same host mask you configured in MySQL (for example `%`, `localhost` or the server hostname) so MySQL grants align with runtime connections.
4. Some hosts let you expose credentials through environment variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). When those are present `config.php` is optional.
5. Ensure PHP 8 + `mysqli` are enabled and that requests to `api/` are allowed. After that you can use the same URLs as on XAMPP.

## Runtime architecture
- The front-end performs `fetch` requests against `api/db.php`, which now splits the JSON payload across normalized tables (`waters`, `steks`, `spots`, `bathy_points`, `bathy_datasets`, `settings`) before serving the combined document back to the browser. Every bathymetry save also records dataset metadata (name, counts, depth range, bounding box, timestamp) so the `bathy_datasets` table stays in sync for exports even though the toolbar no longer renders a list. The Deeper importer batches CSV/ZIP chunks and streams them to `api/db.php?action=bathy_append`, so MySQL receives large payloads immediately instead of one request per file.
- Clearing bathymetry data in the UI calls `api/db.php?action=bathy_clear`, so only `bathy_points`/`bathy_datasets` are wiped while waters/steks/spots/settings remain untouched.
- `api/install.php` uses the same bootstrapper as `db.php` but adds database/user provisioning plus `config.php` creation when needed.
- `api/bootstrap.php` reads `config.php` (or environment variables), opens the MySQL connection, creates the database if it is missing and verifies every table that the UI depends on (including the Deeper import storage and the legacy `kv` table for migrations).
- On the first run the bootstrapper seeds the default payload (either from the new tables or by migrating the legacy `kv` snapshot). Every interaction in the UI triggers `saveDB()` → `pushDbToServer()`, so MySQL stays synced.
- Whenever PHP confirms that MySQL is reachable the browser starts from a blank snapshot and waits for the live payload, preventing stale heatmaps or markers from lingering when the database is empty. Once the server responds, the exact JSON is cached in `localStorage` so the manual Save/Load/HTML export buttons still have something to work with offline.
- Basemap tiles are requested through `api/tile.php`, a small PHP proxy that caches OSM/Stamen/Carto tiles for 24 hours. Keeping these requests same-origin bypasses browsers that block cross-origin PNGs/JPGs via OpaqueResponseBlocking, so you no longer see tile errors in the console.
- Dataset identifiers, foreign keys and bathymetry metadata are now sanitized and truncated server-side so Deeper imports with long file names can never overflow the `VARCHAR(64)` columns that back the `waters`, `steks`, `spots` or `bathy_datasets` tables.

## Versioning
- `VERSION` and `version.json` contain the current release (`v0.0.0`). Always update both when you bump the version.
- The UI loads `version.json` on startup and mirrors the value in the header and document title.

## Configuration without `config.php`
If your host prefers environment variables you can define the following (via `.htaccess`, the hosting dashboard or your deployment pipeline):
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

When these are present the bootstrapper will use them and ignore `config.php`.
