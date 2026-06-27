<?php
/**
 * DumosRx Smart Download Redirector
 * This script fetches the latest release from the updater.json and redirects the user to the correct asset.
 */

$os = isset($_GET['os']) ? $_GET['os'] : 'windows';

// Default version if updater.json is missing or fails
$version = "0.0.19"; 
$downloadUrl = "";

// Fetch latest release data from DumosRx Server
$url = "https://downloads.dumosrx.com/updater.json";
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_USERAGENT, 'DumosRx-Download-Script');
$response = curl_exec($ch);

if ($response) {
    $data = json_decode($response, true);
    if (isset($data['version'])) {
        $version = str_replace('v', '', $data['version']);
    }
}

// Generate deterministic URLs
if ($os === 'windows') {
    $downloadUrl = "https://downloads.dumosrx.com/DumosRx_{$version}_x64_en-US.msi";
} elseif ($os === 'macos') {
    $downloadUrl = "https://downloads.dumosrx.com/DumosRx_{$version}_x64.dmg";
} elseif ($os === 'linux') {
    $downloadUrl = "https://downloads.dumosrx.com/DumosRx_{$version}_amd64.AppImage";
} elseif ($os === 'android') {
    $downloadUrl = "https://downloads.dumosrx.com/app-release.apk";
}

if ($downloadUrl) {
    header("Location: $downloadUrl");
    exit;
} else {
    // Fallback
    header("Location: https://downloads.dumosrx.com");
    exit;
}
?>
