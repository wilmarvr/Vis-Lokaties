@extends('layouts.app')

@section('content')
    <h1>Sign in</h1>
    @if ($errors->any())
        <div class="alert">
            {{ $errors->first() }}
        </div>
    @endif
    <form method="POST" action="{{ route('login') }}" style="max-width:420px;">
        @csrf
        <label>Email
            <input type="email" name="email" value="{{ old('email') }}" required autofocus>
        </label>
        <label>Password
            <input type="password" name="password" required>
        </label>
        <label style="display:flex;align-items:center;gap:.5rem;">
            <input type="checkbox" name="remember" value="1"> Remember me
        </label>
        <button type="submit">Log in</button>
    </form>
    <p style="margin-top:1rem;">No account? <a href="{{ route('register') }}">Register here</a>.</p>
@endsection
