@extends('layouts.app')

@section('content')
    <h1>Global settings</h1>
    @if (session('status'))
        <div class="alert">{{ session('status') }}</div>
    @endif
    <form method="POST" action="{{ route('admin.settings.store') }}" style="max-width:420px;">
        @csrf
        <label>Key
            <input type="text" name="key" required>
        </label>
        <label>Value (JSON allowed)
            <textarea name="value" rows="3"></textarea>
        </label>
        <button type="submit">Save setting</button>
    </form>
    <h2 style="margin-top:2rem;">Current settings</h2>
    <table>
        <thead>
            <tr>
                <th>Key</th>
                <th>Value</th>
            </tr>
        </thead>
        <tbody>
        @foreach ($settings as $setting)
            <tr>
                <td>{{ $setting->key }}</td>
                <td><code>{{ json_encode($setting->value) }}</code></td>
            </tr>
        @endforeach
        </tbody>
    </table>
@endsection
