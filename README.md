# Vis Lokaties

The Vis Lokaties toolkit now runs as a static HTML/CSS/JS front-end plus a lightweight PHP API so it works on XAMPP and on almost any external hosting plan that offers PHP + MySQL. The installer provisions the database, grants permissions, creates the `kv` table, seeds the default JSON payload and writes `api/config.php`, so every deployment can repair itself as long as you can temporarily supply MySQL admin credentials.

## Repository layout
- `index.html` – user interface and Leaflet map
- `css/` – stylesheets (including the modal styles that power the pickers)
- `js/` – split JavaScript modules (`utils`, `state`, `map-core`, `water-manager`, `spot-manager`, `deeper-import`, `app`)
- `api/` – PHP bootstrapper, database API and installer (`db.php`, `install.php`, `bootstrap.php`, `config*.php`)
- `install.php` – convenience alias that forwards to `api/install.php`
- `version.json` – metadata surfaced inside the UI and `<title>`
- `VERSION` – repository level version string (currently `v0.0.0`)

## Requirements
- PHP 8.0+ with `mysqli`
- MySQL 5.7/8.0 (the MySQL server included in XAMPP works fine)
- A browser that supports modern ES6 syntax (Chrome, Edge, Firefox, Safari)

## Feature overview
`index.html` exposes every tool in one sidebar. Each panel is now fully English:

| Panel | What it does |
| --- | --- |
| **Basemap** | Switch between OSM, Toner, Terrain and Carto Dark tiles. Shows a scale bar, mouse position, zoom level and a live depth tooltip interpolated from your bathymetry. |
| **Spots** | Place swims (stekken) or rigs by clicking the map, toggle clustering, display swim–rig distances, disable clustering when dragging misbehaves and auto-place two rigs for each visible swim. |
| **Detection** | Build new waters from the viewport, a manual selection or OpenStreetMap water polygons. Set the maximum edge length, enter a name and store the polygon. Quickly clear the current selection. |
| **Deeper import & heatmap** | Import CSV/ZIP files or whole directories (for example from Deeper sonar logs), persist bathymetry inside MySQL, monitor the queue/progress bars, tune the heatmap radius/blur/min-max/inversion/clipping and wipe the heatmap or stored bathy points. |
| **Weather & wind** | Fetch live weather or a specific day/hour via Open-Meteo, display the result textually, render a compass overlay and optionally draw wind arrows whose density you control. |
| **Manage everything** | Tabbed tables for waters, swims and rigs so you can rename, relink or delete entries. Clicking a row zooms the map to the corresponding geometry. |
| **Contours** | Generate contour lines from the stored bathymetry inside the current viewport or clear existing contour layers. |
| **Clean-up & export** | Export all data, import GeoJSON, save/load/reset browser snapshots, and download standalone HTML bundles (with or without embedded JSON). |
| **GPS & navigation** | Start or stop live GPS logging to show latitude, longitude, accuracy, speed and bearing in the floating info panel. |

Status updates land in the footer, together with the mouse lat/lon, zoom level and app version (from `version.json`). Every edit (waters, swims, rigs, bathy, settings) is pushed to MySQL through `api/db.php` so the database always stays authoritative.

## Installing on XAMPP
1. Start **Apache** and **MySQL** inside the XAMPP Control Panel.
2. Clone or copy the repository into `C:\xampp\htdocs\vis-lokaties`.
3. Browse to [http://localhost/vis-lokaties/install.php](http://localhost/vis-lokaties/install.php). The wizard asks for:
   - A MySQL admin user (e.g. `root` with an empty password on stock XAMPP).
   - The database name (default `vislokaties`).
   - A new app user + password.
   - The host value that MySQL expects (use `localhost`, `127.0.0.1` or `::1` – match whatever host your MySQL grants target).
4. The installer logs in with the admin account, creates the database and user, grants privileges, verifies the `kv` table schema, writes `api/config.php` and seeds the default JSON.
5. Visit [http://localhost/vis-lokaties/](http://localhost/vis-lokaties/) and start working. All edits are now persisted inside MySQL.

Always open the site via `http://localhost/...` on XAMPP so every `fetch` call to `api/db.php` resolves correctly.

## Deploying to external hosting
1. Upload the entire repository (including `api/`, `css/`, `js/`, `install.php`, `index.html`, `version.json`) to your document root using FTP/SFTP/git.
2. Run `install.php` (or `api/install.php`) in the browser. On managed hosting you typically have phpMyAdmin credentials you can temporarily supply; the installer provisions the rest.
3. If the host does not allow temporary admin credentials, create the database + user manually in the hosting control panel and copy those values into `api/config.php`. Set the "Application host" field in the installer to exactly the same host mask you configured in MySQL (for example `%`, `localhost` or the server hostname) so MySQL grants align with runtime connections.
4. Some hosts let you expose credentials through environment variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). When those are present `config.php` is optional.
5. Ensure PHP 8 + `mysqli` are enabled and that requests to `api/` are allowed. After that you can use the same URLs as on XAMPP.

## Runtime architecture
- The front-end performs `fetch` requests against `api/db.php` to pull/push the entire JSON blob (`waters`, `steks`, `rigs`, `bathy`, `settings`).
- `api/install.php` uses the same bootstrapper as `db.php` but adds database/user provisioning plus `config.php` creation when needed.
- `api/bootstrap.php` reads `config.php` (or environment variables), opens the MySQL connection, ensures the `kv` table exists and validates its schema before returning data.
- On the first run the bootstrapper seeds the default payload. Every interaction in the UI triggers `saveDB()` → `pushDbToServer()`, so MySQL stays synced.

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
