# Vis Lokaties Laravel Edition

A Laravel-based fishing location manager with a MySQL-first schema, user authentication, an admin panel, and a Leaflet-powered map UI that stores waters, steks (swims), rigs, and Deeper bathymetry points per user.

## Features

- **Self-service registration & login** (session-based) with optional admin role for user/setting/backup management.
- **Multi-tenant data model** – every water, stek, rig, dataset, bathymetry point, attachment, and preference is scoped to the authenticated angler.
- **Admin panel** with dashboards, user role management, global settings, and one-click database backups (SQLite file copy or `mysqldump`).
- **Leaflet + Turf + heatmap** frontend served from Blade/Vite (`resources/js/app.js`) that:
  - draws waters/steks/rigs with clustering + drag-to-update
  - streams live depth & distance telemetry per drag
  - imports Deeper CSV/ZIP files straight into the `/api/bathy` endpoint chunk-by-chunk
  - manages contour/heatmap rendering via client-side controls.
- **REST API (routes/api.php)** protected by Sanctum, offering CRUD for all core models plus attachment upload endpoints.
- **Attachment model & storage** for file uploads (stored in `storage/app/attachments`).
- **MySQL by default** (see `.env.example`), while migrations remain portable to SQLite for local smoke tests.

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
   - Create a MySQL database & user that match the `.env` defaults (or update the variables):
     ```sql
     CREATE DATABASE vis_lokaties CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
     CREATE USER 'vislokaties'@'%' IDENTIFIED BY 'secret';
     GRANT ALL PRIVILEGES ON vis_lokaties.* TO 'vislokaties'@'%';
     FLUSH PRIVILEGES;
     ```
   - Adjust `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` in `.env` to the values for your MySQL server.
   - Leave `APP_AUTO_MIGRATE=true` (default) if you want the app to create the schema automatically the first time it runs; set it to `false` if you prefer running `php artisan migrate` manually.
   - (Optional) To use SQLite for quick experiments, switch `DB_CONNECTION=sqlite` and ensure `database/database.sqlite` exists.
4. **(Optional) Manual migrate & seed**
   ```bash
   php artisan migrate --seed
   ```
   The seeder provisions `admin@example.com / password` as an initial admin. If you skip this step, the app will auto-run `php artisan migrate --force` the first time a web request hits it (controlled by `APP_AUTO_MIGRATE`, enabled by default) so an empty database works out of the box.
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
- Trigger DB backups (SQLite copies or MySQL `mysqldump` files) saved under `storage/app/backups/*` with download links. Ensure the `mysqldump` binary is installed and on your `$PATH` when using MySQL.

## Testing

The default PHPUnit & Pest scaffolding from Laravel is available once dependencies are installed:

```bash
php artisan test
```

## Notes

- The JS build references CDN-hosted Leaflet marker icons; during production builds you may opt to copy them locally.
- When moving to MySQL, update `.env` with proper credentials and rerun migrations.
- The importer accepts `.csv` and `.zip` (containing CSVs) and writes data immediately to `/api/bathy` for the current user.
