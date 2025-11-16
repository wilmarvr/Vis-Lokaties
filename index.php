<?php
declare(strict_types=1);

require_once __DIR__ . '/api/bootstrap.php';

$version = trim((string) @file_get_contents(__DIR__ . '/VERSION')) ?: 'v0.0.0';
$dbStatus = ['ok' => true, 'message' => ''];

try {
    $config = loadAppConfig();
    $conn = connectAppDatabase($config);
    $conn->close();
} catch (Throwable $e) {
    $dbStatus['ok'] = false;
    $dbStatus['message'] = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vis Lokaties <?= htmlspecialchars($version, ENT_QUOTES) ?></title>
<meta name="app-version" content="<?= htmlspecialchars($version, ENT_QUOTES) ?>">

<!-- ====== FIX BLOK (vroeg inladen) ====== -->
<script src="js/preload.js"></script>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<link rel="stylesheet" href="css/styles.css">
</head>
<body>
<div id="toolbar">
  <h3>🎣 Vis Lokaties <span id="appVersion"><?= htmlspecialchars($version, ENT_QUOTES) ?></span></h3>

  <div style="margin:4px 0 8px">
    Basemap:
    <select id="basemap">
      <option value="osm">OSM</option>
      <option value="toner">Toner</option>
      <option value="terrain">Terrain</option>
      <option value="dark">Carto Dark</option>
    </select>
  </div>

  <details open>
    <summary>📍 Spots</summary>
    <div>
      <button id="btn-add-stek">➕ New swim (click map)</button>
      <button id="btn-add-rig">🎯 New rig (click map)</button>
      <span id="clickModeBadge" class="badge" style="display:none">click mode active</span><br>
      <label><input type="checkbox" id="useCluster"> Enable clustering</label><br>
      <label><input type="checkbox" id="showDistances" checked> Show swim ↔ rig distances</label><br>
      <button id="btnForceDragFix">⚙️ Disable clustering now</button>
      <button id="btnAutoRigs">🤖 Auto-place rigs for visible swims</button>
    </div>
  </details>

  <details>
    <summary>🔎 Detection</summary>
    <div>
      <label>Max edge (m): <input type="number" id="detMaxEdge" value="250" style="width:80px"></label><br>
      <button id="btnDetectViewport">Detect from viewport</button>
      <button id="btnDetectFromPoints">Detect from selection</button><br>
      <button id="btnDetectOSM">Detect OSM water</button><br>
      <input type="text" id="detName" placeholder="Name for new water"><br>
      <button id="btnSaveAsWater">💾 Save as water</button><br>
      <button id="btnSelClear">🧹 Clear selection</button>
    </div>
  </details>

  <details>
    <summary>🌊 Deeper import & heatmap</summary>
    <div>
      <button id="btn-import-files">📁 Import CSV/ZIP</button>
      <button id="btn-import-dir">📂 Import directory</button><br>
      <input id="fileDeeper" type="file" accept=".csv,.zip" multiple style="display:none">
      <input id="dirDeeper" type="file" webkitdirectory directory multiple style="display:none">
      <label class="muted" title="Bathymetry is stored in MySQL immediately now."><input type="checkbox" id="saveBathy" checked disabled> Bathymetry is saved directly in the DB</label><br>
      <div class="progress"><div id="impBarAll" class="bar"></div></div>
      <span id="impCount">0/0</span> | <span id="impPctAll">0%</span>
      <pre id="queue" style="font-size:11px;max-height:80px;overflow:auto;"></pre>
      <hr>
      <div>Radius:<input type="range" id="hmRadius" min="1" max="50" value="25"><span id="hmR">25</span></div>
      <div>Blur:<input type="range" id="hmBlur" min="1" max="40" value="15"><span id="hmB">15</span></div>
      <label>Min m:<input type="number" id="hmMin" step="0.1" style="width:60px"></label>
      <label>Max m:<input type="number" id="hmMax" step="0.1" style="width:60px"></label><br>
      <label><input type="checkbox" id="hmInvert"> Invert colors</label>
      <label><input type="checkbox" id="hmClip"> Clip to viewport</label><br>
      <label><input type="checkbox" id="hmFixed"> Fixed 0–20 m range</label><br>
      <div id="legend" class="legend"></div>
      <div id="hmStats">Min: – • Max: –</div>
      <hr>
      <button id="btn-clear-heat">🔥 Clear heatmap</button>
      <button id="btn-clear-bathy">💧 Clear DB bathy</button>
      <div>Total points: <span id="bathyTotal">0</span> | Heatmap: <span id="heatCount">0</span></div>
    </div>
  </details>

  <details>
    <summary>☁️ Weather & wind</summary>
    <div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
        <button id="btnWeatherNow">Live weather</button>
        <label>Day: <input type="date" id="wxDate"></label>
        <label>Hour: <select id="wxHour"></select></label>
        <button id="btnWeatherLoad">Load forecast</button>
      </div>
      <div id="wxOut" class="mono" style="margin-top:6px">—</div>
      <label style="display:block;margin-top:6px"><input type="checkbox" id="wxDrawArrows"> Draw wind arrows on map</label>
      <label style="display:block">Density: <input type="range" id="wxDensity" min="1" max="6" value="3"> <span id="wxDensityLbl">3</span></label>
    </div>
  </details>

  <details>
    <summary>📊 Manage everything</summary>
    <div>
      <div class="tabs">
        <button class="tab active" data-tab="waters">Waters</button>
        <button class="tab" data-tab="steks">Swims</button>
        <button class="tab" data-tab="rigs">Rig spots</button>
      </div>
      <div id="tab-waters"></div>
      <div id="tab-steks" style="display:none"></div>
      <div id="tab-rigs" style="display:none"></div>
    </div>
  </details>

  <details id="contourPanel">
    <summary>🗺️ Contours</summary>
    <div>
      <button id="btn-gen-contours">Generate contours</button>
      <button id="btn-clear-contours">Clear contours</button>
      <div class="muted" style="margin-top:4px">Uses DB bathymetry inside the viewport</div>
      <div id="contourProgressWrap" class="contour-progress" style="display:none">
        <div class="progress"><div id="contourProgressBar" class="bar"></div></div>
        <div id="contourProgressText" class="muted">Idle</div>
      </div>
    </div>
  </details>

  <details>
    <summary>🧨 Clean-up & export</summary>
    <div>
      <button id="btnExport">💾 Export everything</button>
      <button id="btn-import-files2">📥 Import GeoJSON</button>
      <input id="fileMerge" type="file" accept=".json,.geojson" style="display:none"><br>
      <button id="btnLocalSave">💾 Save in browser</button>
      <button id="btnLocalLoad">📤 Load from browser</button>
      <button id="btnLocalReset" class="btn danger">Reset browser data</button><br>
      <button id="btnSaveHtml">📄 Download HTML</button>
      <button id="btnSaveHtmlWithData">📄 Download HTML (with data)</button>
    </div>
  </details>

  <details>
    <summary>🛰️ GPS & navigation</summary>
    <div>
      <button id="btnGps">📡 Start/Stop GPS</button>
      <label>Status: <span id="gpsStatus">off</span></label>
    </div>
  </details>
</div>

<div id="mapContainer"></div>
<div id="footer">
  <div id="statusLine">Ready.</div>
  <div id="footerDetect">—</div>
  <div id="mouseDepth">Depth: —</div>
  <div id="mouseLL">—</div>
  <div id="zoomLbl">—</div>
</div>
<div id="depthTip"></div>

<div id="gpsPanel">
  📍 GPS: Lat <span id="gpsLat">–</span> Lon <span id="gpsLon">–</span><br>
  🎯 Accuracy: <span id="gpsAcc">–</span> m | Speed: <span id="gpsSpd">–</span> m/s | Bearing: <span id="gpsBrg">–</span>°
</div>

<?php if (!$dbStatus['ok']): ?>
<div class="db-alert">
  <div class="db-alert__panel">
    <h2>Database unavailable</h2>
    <p>The application could not reach MySQL using the configured credentials. Please run the installer or fix `api/config.php`.</p>
    <pre><?= htmlspecialchars($dbStatus['message'], ENT_QUOTES) ?></pre>
    <p><a href="install.php">Open installer</a></p>
  </div>
</div>
<?php endif; ?>

<!-- Leaflet & plugins -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>

<!-- Extra libs -->
<script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="https://unpkg.com/@turf/turf@6.5.0/turf.min.js"></script>

<!-- (optioneel) snapshot container: wordt bij 'Download HTML (met data)' gevuld -->
<script type="application/json" id="lv_db_snapshot">{}</script>

<script>window.APP_DB_READY = <?= $dbStatus['ok'] ? 'true' : 'false' ?>;</script>
<script src="js/utils.js" defer></script>
<script src="js/state.js" defer></script>
<script src="js/map-core.js" defer></script>
<script src="js/water-manager.js" defer></script>
<script src="js/spot-manager.js" defer></script>
<script src="js/deeper-import.js" defer></script>
<script src="js/app.js" defer></script>
</body>
</html>
