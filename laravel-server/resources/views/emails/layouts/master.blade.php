<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>{{ $subject ?? 'DumosRx' }}</title>
    <style>
        body {
            background-color: #f3f4f6;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            width: 100%;
        }
        .wrapper {
            width: 100%;
            table-layout: fixed;
            background-color: #f3f4f6;
            padding-top: 40px;
            padding-bottom: 40px;
        }
        .main {
            background-color: #ffffff;
            margin: 0 auto;
            width: 100%;
            max-width: 600px;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            overflow: hidden;
        }
        .header {
            padding: 30px;
            text-align: center;
            background-color: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
        }
        .header h1 {
            margin: 0;
            color: #4f46e5;
            font-size: 24px;
            font-weight: 700;
        }
        .content {
            padding: 40px 30px;
            color: #374151;
            line-height: 1.6;
            font-size: 16px;
        }
        .footer {
            text-align: center;
            padding: 30px;
            color: #6b7280;
            font-size: 13px;
            background-color: #f9fafb;
            border-top: 1px solid #e5e7eb;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4f46e5;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
        }
        h2 {
            color: #111827;
            font-size: 20px;
            margin-top: 0;
        }
        p {
            margin-top: 0;
            margin-bottom: 20px;
        }
        .footer-links a {
            color: #4f46e5;
            text-decoration: none;
            margin: 0 10px;
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <table class="main" width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
                <td class="header">
                    <h1>DumosRx</h1>
                </td>
            </tr>
            <tr>
                <td class="content">
                    @yield('content')
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p>&copy; {{ date('Y') }} DumosRx Platform. All rights reserved.</p>
                    <div class="footer-links">
                        <a href="#">Support</a> | <a href="#">Privacy Policy</a>
                    </div>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>
