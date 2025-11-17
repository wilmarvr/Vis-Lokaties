<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('waters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('description')->nullable();
            $table->json('geometry')->nullable();
            $table->string('color')->default('#33a1ff');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waters');
    }
};
