<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .button { display: inline-block; padding: 10px 20px; background-color: #0f172a; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Hi {{ $user->first_name }},</h2>
        <p>You recently registered for DumosRx, but it looks like you haven't set up the desktop client yet.</p>
        <p>To get the most out of your store management system and ensure offline capability, you need to download and install the DumosRx Desktop App.</p>
        <p>Click the button below to log into your dashboard and download the app:</p>
        <a href="{{ $dashboardUrl }}" class="button" style="color: white;">Download DumosRx Desktop</a>
        <p style="margin-top: 30px;">If you have any questions, reply to this email to reach our support team.</p>
        <p>Best regards,<br>The DumosRx Team</p>
    </div>
</body>
</html>
