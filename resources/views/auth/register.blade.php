@extends('layouts.app')

@section('content')
    <h1>Create account</h1>
    @if ($errors->any())
        <div class="alert">
            {{ $errors->first() }}
        </div>
    @endif
    <form method="POST" action="{{ route('register') }}" style="max-width:420px;">
        @csrf
        <label>Name
            <input type="text" name="name" value="{{ old('name') }}" required>
        </label>
        <label>Email
            <input type="email" name="email" value="{{ old('email') }}" required>
        </label>
        <label>Password
            <input type="password" name="password" required>
        </label>
        <label>Confirm password
            <input type="password" name="password_confirmation" required>
        </label>
        <button type="submit">Register</button>
    </form>
    <p style="margin-top:1rem;">Already registered? <a href="{{ route('login') }}">Sign in</a>.</p>
@endsection
