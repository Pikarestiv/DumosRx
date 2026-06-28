<?php
// Find all directories that match version pattern (e.g. v0.0.19)
$versionDirs = array_filter(glob('v*'), 'is_dir');

// Sort directories by version descending
usort($versionDirs, 'version_compare');
$versionDirs = array_reverse($versionDirs);

// Group files by version
$releases = [];
foreach ($versionDirs as $dir) {
    $files = array_filter(scandir($dir), function($file) use ($dir) {
        return $file[0] !== '.' && is_file($dir . '/' . $file);
    });
    
    if (!empty($files)) {
        usort($files, function($a, $b) use ($dir) {
            return filemtime($dir . '/' . $b) - filemtime($dir . '/' . $a);
        });
        $releases[$dir] = $files;
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DumosRx Release Archive</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
        details[open] summary .arrow { transform: rotate(180deg); }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 font-sans p-8">
    <div class="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div class="bg-blue-600 p-8 text-white">
            <h1 class="text-3xl font-bold">DumosRx Release Archive</h1>
            <p class="mt-2 text-blue-100">Download previous versions and beta releases.</p>
        </div>
        <div class="p-6">
            <?php if (empty($releases)): ?>
                <!-- EMPTY STATE -->
                <div class="flex flex-col items-center justify-center p-16 text-center">
                    <div class="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                        <span class="text-4xl">📦</span>
                    </div>
                    <h2 class="text-2xl font-bold mb-2 text-gray-800">No Releases Yet</h2>
                    <p class="text-gray-500 max-w-md">
                        We are currently preparing the initial public release of the DumosRx offline client. Please check back soon!
                    </p>
                </div>
            <?php else: ?>
                <!-- ACCORDION LIST -->
                <div class="space-y-4">
                    <?php $isFirst = true; foreach($releases as $version => $files): ?>
                        <details class="group border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm" <?php echo $isFirst ? 'open' : ''; ?>>
                            <summary class="flex items-center justify-between p-5 cursor-pointer bg-gray-50 hover:bg-gray-100 transition">
                                <div class="flex items-center space-x-3">
                                    <span class="text-2xl">🔖</span>
                                    <h2 class="text-xl font-bold text-gray-800">Release <?php echo htmlspecialchars($version); ?></h2>
                                </div>
                                <div class="arrow transition-transform duration-200 text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </summary>
                            
                            <ul class="divide-y divide-gray-100 border-t border-gray-100">
                                <?php foreach($files as $file): $path = $version . '/' . $file; ?>
                                <li class="p-4 hover:bg-gray-50 transition flex items-center justify-between">
                                    <div class="flex items-center space-x-4">
                                        <span class="text-2xl opacity-80">📦</span>
                                        <div>
                                            <a href="<?php echo htmlspecialchars($path); ?>" class="text-lg font-semibold text-blue-600 hover:underline">
                                                <?php echo htmlspecialchars($file); ?>
                                            </a>
                                            <p class="text-sm text-gray-500">
                                                Added: <?php echo date("F d, Y H:i", filemtime($path)); ?> • 
                                                Size: <?php echo round(filesize($path) / 1024 / 1024, 2); ?> MB
                                            </p>
                                        </div>
                                    </div>
                                    <a href="<?php echo htmlspecialchars($path); ?>" class="px-5 py-2.5 bg-blue-50 text-blue-600 font-bold rounded-lg hover:bg-blue-600 hover:text-white transition shadow-sm border border-blue-100">
                                        Download
                                    </a>
                                </li>
                                <?php endforeach; ?>
                            </ul>
                        </details>
                    <?php $isFirst = false; endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
