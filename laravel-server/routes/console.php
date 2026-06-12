<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('funnel:remind')->daily();
Schedule::command('summary:end-of-day')->dailyAt('21:00')->timezone('Africa/Lagos');
