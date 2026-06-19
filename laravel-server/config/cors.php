<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        'http://localhost:3000', 
        'http://localhost:3001', 
        'http://localhost:3002', 
        'http://localhost:3003', 
        'http://127.0.0.1:3000', 
        'http://127.0.0.1:8000', 
        'https://dumosrx.com',
        'https://dev.dumosrx.com',
        'https://app.dev.dumosrx.com',
        'https://www.dumosrx.com', 
        'https://app.dumosrx.com',
        'https://admin.dumosrx.com',
        'http://tauri.localhost',
        'https://tauri.localhost',
        'tauri://localhost'
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
