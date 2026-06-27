<?php
/**
 * DumosRx Smart Download Redirector
 * This script fetches the latest release from the updater.json and redirects the user to the correct asset.
 */

$os = isset($_GET['os']) ? $_GET['os'] : 'windows';

// Fetch latest release data from DumosRx Server
$url = "https://downloads.dumosrx.com/updater.json";
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_USERAGENT, 'DumosRx-Download-Script');
$response = curl_exec($ch);

if (!$response) {
    die("Connection to DumosRx failed. Please try again later.");
}

$data = json_decode($response, true);

if (!isset($data['platforms'])) {
    die("No release assets found.");
}

$downloadUrl = "";

if ($os === 'windows') {
    $downloadUrl = $data['platforms']['windows-x86_64']['url'] ?? '';
} elseif ($os === 'macos') {
    $downloadUrl = $data['platforms']['darwin-aarch64']['url'] ?? $data['platforms']['darwin-x86_64']['url'] ?? '';
} elseif ($os === 'linux') {
    $downloadUrl = $data['platforms']['linux-x86_64']['url'] ?? '';
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
