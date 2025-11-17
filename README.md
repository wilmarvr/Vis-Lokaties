# Vis Lokaties Laravel Edition

A Laravel-based fishing location manager with MySQL/SQLite-friendly schema, user authentication, an admin panel, and a Leaflet-powered map UI that stores waters, steks (swims), rigs, and Deeper bathymetry points per user.

## Features

- **Self-service registration & login** (session-based) with optional admin role for user/setting/backup management.
- **Multi-tenant data model** – every water, stek, rig, dataset, bathymetry point, attachment, and preference is scoped to the authenticated angler.
- **Admin panel** with dashboards, user role management, global settings, and one-click SQLite backups.
- **Leaflet + Turf + heatmap** frontend served from Blade/Vite (`resources/js/app.js`) that:
  - draws waters/steks/rigs with clustering + drag-to-update
  - streams live depth & distance telemetry per drag
  - imports Deeper CSV/ZIP files straight into the `/api/bathy` endpoint chunk-by-chunk
  - manages contour/heatmap rendering via client-side controls.
- **REST API (routes/api.php)** protected by Sanctum, offering CRUD for all core models plus attachment upload endpoints.
- **Attachment model & storage** for file uploads (stored in `storage/app/attachments`).
- **SQLite by default** (see `.env.example`) but migrations are portable to MySQL.

## Getting Started

1. **Install PHP dependencies** (internet access required):
   ```bash
   composer install
   ```
2. **Install JS/Vite dependencies** (optional but recommended for asset building):
   ```bash
   npm install
   npm run build # or npm run dev
   ```
3. **Environment**
   - Copy `.env.example` to `.env` and generate an app key:
     ```bash
     cp .env.example .env
     php artisan key:generate
     ```
   - The default DB connection uses SQLite at `database/database.sqlite`. Ensure the file exists (`touch database/database.sqlite`).
4. **Migrate & seed**
   ```bash
   php artisan migrate --seed
   ```
   The seeder provisions `admin@example.com / password` as an initial admin.
5. **Serve**
   ```bash
   php artisan serve
   ```
   Then visit `http://localhost:8000`, register/sign-in, and open the map workspace.

## API Overview

All routes live under `/api/*` and require Sanctum-authenticated sessions:

| Endpoint | Description |
| --- | --- |
| `GET/POST/PATCH/DELETE /api/waters` | Manage waters (GeoJSON geometry + color) |
| `api/steks`, `api/rigs` | CRUD for swims & rigs, auto-coupled to nearest parents |
| `GET/POST/DELETE /api/bathy` | Stream Deeper samples (points chunked at 500 rows) |
| `GET/POST /api/settings` | Per-user JSON settings |
| `POST/DELETE /api/attachments` | Upload/download references |

The Blade/Vite client consumes these endpoints via Axios and surfaces errors inside the toolbar.

## Admin Panel

Once logged in as an admin, use the header link to reach `/admin` and:

- Inspect live dataset counts.
- Toggle user admin flags or delete stale users.
- Create key/value global settings records (stored in `settings` table where `user_id` is `NULL`).
- Trigger SQLite backups saved under `storage/app/backups/*` with download links.

## Testing

The default PHPUnit & Pest scaffolding from Laravel is available once dependencies are installed:

```bash
php artisan test
```

## Notes

- The JS build references CDN-hosted Leaflet marker icons; during production builds you may opt to copy them locally.
- When moving to MySQL, update `.env` with proper credentials and rerun migrations.
- The importer accepts `.csv` and `.zip` (containing CSVs) and writes data immediately to `/api/bathy` for the current user.
