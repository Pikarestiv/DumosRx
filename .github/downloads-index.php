<?php
// Scan directory and filter out hidden files, index.php, and updater.json
$files = array_filter(scandir('.'), function($file) {
    return $file[0] !== '.' && $file !== 'index.php' && $file !== 'updater.json';
});

// Sort files by modification time (newest first)
usort($files, function($a, $b) {
    return filemtime($b) - filemtime($a);
});
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DumosRx Release Archive</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 text-gray-900 font-sans p-8">
    <div class="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div class="bg-blue-600 p-8 text-white">
            <h1 class="text-3xl font-bold">DumosRx Release Archive</h1>
            <p class="mt-2 text-blue-100">Download previous versions and beta releases.</p>
        </div>
        <div class="p-0">
            <?php if (empty($files)): ?>
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
                <!-- FILE LIST -->
                <ul class="divide-y divide-gray-100">
                    <?php foreach($files as $file): ?>
                        <?php if(is_file($file)): ?>
                        <li class="p-4 hover:bg-gray-50 transition flex items-center justify-between group">
                            <div class="flex items-center space-x-4">
                                <span class="text-2xl opacity-80 group-hover:opacity-100">📦</span>
                                <div>
                                    <a href="<?php echo htmlspecialchars($file); ?>" class="text-lg font-semibold text-blue-600 hover:underline">
                                        <?php echo htmlspecialchars($file); ?>
                                    </a>
                                    <p class="text-sm text-gray-500">
                                        Added: <?php echo date("F d, Y H:i", filemtime($file)); ?> • 
                                        Size: <?php echo round(filesize($file) / 1024 / 1024, 2); ?> MB
                                    </p>
                                </div>
                            </div>
                            <a href="<?php echo htmlspecialchars($file); ?>" class="px-5 py-2.5 bg-blue-50 text-blue-600 font-bold rounded-lg hover:bg-blue-600 hover:text-white transition shadow-sm border border-blue-100">
                                Download
                            </a>
                        </li>
                        <?php endif; ?>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
