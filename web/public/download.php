<?php
/**
 * DumosRx Smart Download Redirector
 * This script fetches the latest release from GitHub and redirects the user to the correct asset.
 */

$repo = "Pikarestiv/DumosRx";
$os = isset($_GET['os']) ? $_GET['os'] : 'windows';

// Fetch latest release data from GitHub API
$url = "https://api.github.com/repos/$repo/releases/latest";
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_USERAGENT, 'DumosRx-Download-Script');
$response = curl_exec($ch);
// curl_close is no longer required in PHP 8.0+ as the handle is an object

if (!$response) {
    die("Connection to GitHub failed. Please try again later.");
}

$data = json_decode($response, true);

if (!isset($data['assets'])) {
    die("No release assets found.");
}

$downloadUrl = "";

foreach ($data['assets'] as $asset) {
    $name = $asset['name'];
    
    if ($os === 'windows' && strpos($name, '.msi') !== false) {
        $downloadUrl = $asset['browser_download_url'];
        break;
    }
    
    if ($os === 'macos' && strpos($name, '.dmg') !== false) {
        $downloadUrl = $asset['browser_download_url'];
        break;
    }
}

if ($downloadUrl) {
    header("Location: $downloadUrl");
    exit;
} else {
    // Fallback to the releases page if specific asset not found
    header("Location: https://github.com/$repo/releases/latest");
    exit;
}
?>
