@extends('layouts.app')

@section('content')
<div id="map-app" data-user="{{ auth()->user()->name }}">
    <div class="map-toolbar">
        <h2>Waters & spots</h2>
        <button data-action="add-water">Add water</button>
        <button data-action="add-stek">Add swim</button>
        <button data-action="add-rig">Add rig</button>
        <label class="inline"><input type="checkbox" data-setting="showDistances" checked> Show distances</label>
        <label class="inline"><input type="checkbox" data-setting="cluster" checked> Enable clustering</label>
        <hr>
        <h3>Heatmap controls</h3>
        <label>Radius <input type="range" min="5" max="70" value="25" data-heat="radius"></label>
        <label>Blur <input type="range" min="5" max="60" value="30" data-heat="blur"></label>
        <label>Depth min <input type="number" step="0.1" value="0" data-heat="min"></label>
        <label>Depth max <input type="number" step="0.1" value="20" data-heat="max"></label>
        <button data-action="import-bathy">Import Deeper CSV/ZIP</button>
        <button data-action="clear-bathy" class="secondary">Clear bathy</button>
        <div class="legend"></div>
        <hr>
        <h3>Selection</h3>
        <p class="muted">Click markers to see depth/notes. Drag markers to update position; the UI shows live distance + depth.</p>
        <div id="selection-panel"></div>
    </div>
    <div id="map"></div>
</div>
@endsection
