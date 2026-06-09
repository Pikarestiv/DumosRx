<?php
$dbPath = __DIR__ . '/dumomvte_dumosrx_db';
$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$stmt = $pdo->prepare("
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
        email VARCHAR(255) PRIMARY KEY,
        token VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
");

$stmt->execute();

echo "email_verification_tokens table created successfully via PDO.\n";
