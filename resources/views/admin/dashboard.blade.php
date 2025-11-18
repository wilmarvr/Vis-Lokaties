@extends('layouts.app')

@section('content')
    <h1>Admin dashboard</h1>
    <div class="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">
        <div class="alert">Users: {{ $userCount }}</div>
        <div class="alert">Waters: {{ $waterCount }}</div>
        <div class="alert">Steks: {{ $stekCount }}</div>
        <div class="alert">Rigs: {{ $rigCount }}</div>
        <div class="alert">Datasets: {{ $datasetCount }}</div>
        <div class="alert">Bathy points: {{ $bathyCount }}</div>
    </div>
    <p style="margin-top:1rem;">Use the navigation above to manage users, settings, or backups.</p>
@endsection
