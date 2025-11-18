<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ config('app.name') }}</title>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css">
    <link rel="stylesheet" href="{{ asset('css/app.css') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root { color-scheme: dark; }
        body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin:0; background:#05070b; color:#e6edf3; }
        a { color:#5dbbff; }
        header { padding:1rem 2rem; border-bottom:1px solid rgba(255,255,255,.08); }
        main { padding:2rem; min-height:calc(100vh - 120px); }
        .container { max-width:1200px; margin:0 auto; }
        nav a { margin-right:1rem; }
        .alert { background:#12233a; border-left:4px solid #45c4ff; padding:0.75rem 1rem; margin-bottom:1rem; border-radius:0.5rem; }
        form label { display:block; margin-bottom:0.5rem; }
        input, select, textarea { width:100%; padding:0.6rem; border-radius:0.5rem; border:1px solid rgba(255,255,255,.15); background:#0d1420; color:#e6edf3; }
        button { background:#1d4ed8; border:none; color:white; padding:0.6rem 1rem; border-radius:0.5rem; cursor:pointer; }
        button.secondary { background:#253046; }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:0.5rem; border-bottom:1px solid rgba(255,255,255,.08); text-align:left; }
    </style>
</head>
<body>
<header>
    <div class="container" style="display:flex; align-items:center; justify-content:space-between;">
        <div>
            <strong>{{ config('app.name') }}</strong>
            <nav style="display:inline-block; margin-left:1rem;">
                @auth
                    <a href="{{ route('dashboard') }}">Map</a>
                    @can('access-admin')
                        <a href="{{ route('admin.dashboard') }}">Admin</a>
                    @endcan
                @endauth
            </nav>
        </div>
        <div>
            @auth
                <span style="margin-right:1rem;">{{ auth()->user()->name }}</span>
                <form method="POST" action="{{ route('logout') }}" style="display:inline;">
                    @csrf
                    <button type="submit" class="secondary">Log out</button>
                </form>
            @else
                <a href="{{ route('login') }}">Log in</a>
            @endauth
        </div>
    </div>
</header>
<main>
    <div class="container">
        {{ $slot ?? '' }}
        @yield('content')
    </div>
</main>
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.8/dist/axios.min.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
<script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
<script src="https://unpkg.com/@turf/turf@6.5.0/turf.min.js"></script>
<script src="{{ asset('js/app.js') }}" defer></script>
</body>
</html>
