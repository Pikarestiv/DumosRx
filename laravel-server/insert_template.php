<?php
$dbPath = __DIR__ . '/dumomvte_dumosrx_db';
$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$content = <<<HTML
@extends('emails.layouts.master')

@section('content')
    <h2>Verify Your Email Address</h2>
    <p>Hello {{ \$user->first_name }},</p>
    <p>Thank you for registering on DumosRx. To ensure the security of your account and unlock full access to the platform, please verify your email address by clicking the button below.</p>
    
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{ \$verificationUrl }}" class="button">Verify Email</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        If you did not create an account using this email address, please ignore this email.
    </p>

    <p>Best regards,<br><strong>DumosRx Security Team</strong></p>
    
    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">
        If you're having trouble clicking the "Verify Email" button, copy and paste the URL below into your web browser:<br>
        <a href="{{ \$verificationUrl }}" style="color: #4f46e5;">{{ \$verificationUrl }}</a>
    </p>
@endsection
HTML;

$variables = json_encode([
    ['name' => '$user->first_name', 'description' => "User's first name"],
    ['name' => '$verificationUrl', 'description' => 'The unique email verification link']
]);

$stmt = $pdo->prepare("
    INSERT INTO email_templates (`key`, `name`, `subject`, `content`, `variables`, `created_at`, `updated_at`)
    VALUES (:key, :name, :subject, :content, :variables, :created_at, :updated_at)
    ON CONFLICT(`key`) DO UPDATE SET
        `name`=excluded.`name`,
        `subject`=excluded.`subject`,
        `content`=excluded.`content`,
        `variables`=excluded.`variables`,
        `updated_at`=excluded.`updated_at`
");

$stmt->execute([
    ':key' => 'email_verification',
    ':name' => 'Email Verification',
    ':subject' => 'Please Verify Your DumosRx Account',
    ':content' => $content,
    ':variables' => $variables,
    ':created_at' => date('Y-m-d H:i:s'),
    ':updated_at' => date('Y-m-d H:i:s')
]);

echo "Template inserted successfully via PDO.\n";
