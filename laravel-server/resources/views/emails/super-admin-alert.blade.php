<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $alertTitle }}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 28px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; width: 100%; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
                    <tr>
                        <td style="background-color: {{ $palette['headerBg'] }}; padding: 20px 24px; color: #ffffff;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="vertical-align: middle;">
                                        <span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;">
                                            {{ $badge }}
                                        </span>
                                    </td>
                                    <td align="right" style="vertical-align: middle;">
                                        <span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; background-color: {{ $isProduction ? 'rgba(255, 255, 255, 0.16)' : '#f59e0b' }}; color: {{ $isProduction ? '#ffffff' : '#0f172a' }}; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;">
                                            {{ $environment }}
                                        </span>
                                    </td>
                                </tr>
                            </table>
                            <h1 style="margin: 12px 0 4px 0; font-size: 20px; font-weight: 700; color: #ffffff;">DumosRx Super Admin Alert</h1>
                            <p style="margin: 0; font-size: 13px; color: rgba(255, 255, 255, 0.88);">{{ $alertTitle }}</p>
                        </td>
                    </tr>

                    <tr>
                        <td style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 24px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 12px; color: #475569;">
                                <tr>
                                    <td style="padding: 2px 12px 2px 0; vertical-align: top;">
                                        <strong style="color: #0f172a;">Recorded:</strong> {{ $occurredAtLagos }} ({{ $occurredAtUtc }})
                                    </td>
                                    <td align="right" style="padding: 2px 0; vertical-align: top;">
                                        <strong style="color: #0f172a;">Host:</strong> {{ $host }}
                                    </td>
                                </tr>
                                @if (! empty($meta))
                                    @foreach (array_chunk($meta, 2, true) as $metaPair)
                                        <tr>
                                            @foreach ($metaPair as $metaKey => $metaVal)
                                                <td @if ($loop->count === 1) colspan="2" @endif style="padding: 4px 12px 2px 0; vertical-align: top;">
                                                    <strong style="color: #0f172a;">{{ $metaKey }}:</strong> {{ $metaVal }}
                                                </td>
                                            @endforeach
                                        </tr>
                                    @endforeach
                                @endif
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 24px;">
                            <h2 style="margin: 0 0 16px 0; padding-left: 12px; border-left: 4px solid {{ $palette['accent'] }}; font-size: 18px; font-weight: 700; color: #0f172a;">
                                {{ $alertTitle }}
                            </h2>

                            @if (! empty($metrics))
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 18px; border-collapse: separate; border-spacing: 8px 8px; margin-left: -8px; margin-right: -8px; width: calc(100% + 16px);">
                                    @foreach (array_chunk($metrics, 2) as $metricRow)
                                        <tr>
                                            @foreach ($metricRow as $metric)
                                                <td width="50%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; vertical-align: top;">
                                                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 4px;">
                                                        {{ $metric['label'] }}
                                                    </div>
                                                    <div style="font-size: 18px; font-weight: 700; color: #0f172a;">
                                                        {{ $metric['value'] }}
                                                    </div>
                                                    @if (! empty($metric['hint']))
                                                        <div style="font-size: 12px; color: #475569; margin-top: 3px;">
                                                            {{ $metric['hint'] }}
                                                        </div>
                                                    @endif
                                                </td>
                                            @endforeach
                                            @if (count($metricRow) === 1)
                                                <td width="50%"></td>
                                            @endif
                                        </tr>
                                    @endforeach
                                </table>
                            @endif

                            @foreach ($blocks as $block)
                                @if ($block['type'] === 'kv')
                                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13px;">
                                        @foreach ($block['rows'] as $row)
                                            <tr>
                                                <td style="width: 36%; padding: 9px 12px; background-color: #f8fafc; color: #475569; font-weight: 600; border-bottom: {{ $loop->last ? 'none' : '1px solid #e2e8f0' }}; vertical-align: top;">
                                                    {{ $row['label'] }}
                                                </td>
                                                <td style="padding: 9px 12px; color: #0f172a; border-bottom: {{ $loop->last ? 'none' : '1px solid #e2e8f0' }}; vertical-align: top; word-break: break-word;">
                                                    {!! nl2br(e($row['value'])) !!}
                                                </td>
                                            </tr>
                                        @endforeach
                                    </table>
                                @elseif ($block['type'] === 'list')
                                    <ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 14px; color: #1e293b;">
                                        @foreach ($block['items'] as $item)
                                            <li style="margin-bottom: 6px;">{!! nl2br(e($item)) !!}</li>
                                        @endforeach
                                    </ul>
                                @else
                                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #1e293b; word-break: break-word;">
                                        {!! nl2br(e($block['text'])) !!}
                                    </p>
                                @endif
                            @endforeach

                            @foreach ($sections as $section)
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                    <tr>
                                        <td style="background-color: #f8fafc; padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">
                                            <strong style="font-size: 13px; color: #0f172a;">{{ $section['heading'] }}</strong>
                                        </td>
                                    </tr>
                                    @if (! empty($section['rows']))
                                        <tr>
                                            <td style="padding: 0;">
                                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
                                                    @foreach ($section['rows'] as $rowLabel => $rowValue)
                                                        <tr>
                                                            <td style="width: 42%; padding: 8px 14px; color: #475569; font-weight: 600; border-bottom: {{ $loop->last && empty($section['items']) ? 'none' : '1px solid #f1f5f9' }}; vertical-align: top;">
                                                                {{ $rowLabel }}
                                                            </td>
                                                            <td style="padding: 8px 14px; color: #0f172a; border-bottom: {{ $loop->last && empty($section['items']) ? 'none' : '1px solid #f1f5f9' }}; vertical-align: top;">
                                                                {{ $rowValue }}
                                                            </td>
                                                        </tr>
                                                    @endforeach
                                                </table>
                                            </td>
                                        </tr>
                                    @endif
                                    @if (! empty($section['items']))
                                        <tr>
                                            <td style="padding: 10px 14px; font-size: 13px; color: #1e293b;">
                                                <ul style="margin: 0; padding-left: 18px;">
                                                    @foreach ($section['items'] as $item)
                                                        <li style="margin-bottom: 4px;">{{ $item }}</li>
                                                    @endforeach
                                                </ul>
                                            </td>
                                        </tr>
                                    @endif
                                </table>
                            @endforeach

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
                                <tr>
                                    <td align="center">
                                        <a href="{{ $action['url'] }}" style="display: inline-block; padding: 11px 22px; background-color: {{ $palette['accent'] }}; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
                                            {{ $action['label'] }}
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b;">
                            Automated alert from <strong style="color: #475569;">DumosRx System</strong> ({{ $host }} · {{ $environment }}) ·
                            <a href="{{ $adminPortalUrl }}" style="color: #2563eb; text-decoration: none;">Admin Portal</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
