<?php

namespace App\Services\Admin;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

class AdminDailySummaryService
{
    public function __construct(private readonly AdminDailyMetricsCollector $collector) {}

    /**
     * @return array{title: string, lines: array<int, string>, details: array<string, mixed>}
     */
    public function buildForDate(?CarbonInterface $targetDate = null): array
    {
        $day = $targetDate
            ? Carbon::parse($targetDate->format('Y-m-d'), 'Africa/Lagos')->startOfDay()
            : Carbon::yesterday('Africa/Lagos')->startOfDay();

        $dateString = $day->toDateString();
        $startUtc = $day->copy()->startOfDay()->utc();
        $endUtc = $day->copy()->endOfDay()->utc();
        $now = now();

        $fleet = $this->collector->fleet($startUtc, $endUtc);
        $devices = $this->collector->devices($startUtc, $endUtc);
        $downloads = $this->collector->downloads($startUtc, $endUtc);
        $commerce = $this->collector->commerce($startUtc, $endUtc);
        $billing = $this->collector->billing($startUtc, $endUtc, $now);
        $health = $this->collector->health($dateString, $startUtc, $endUtc);

        $attentionCount = $health['open_tickets'] + $health['sync_failures'];
        $hasWarnings = $health['sync_failures'] > 0
            || $health['security_events'] > 0
            || $health['open_tickets'] > 0
            || ($health['refused'] > 0 && $health['rate_pct'] !== null && $health['rate_pct'] < 95.0);

        $pwaRows = [
            'Stores Synced Yesterday' => "{$fleet['stores_synced']} of {$fleet['total_stores']} live stores",
            'Synced Tills / Devices' => $this->formatDeviceBreakdown($devices),
            'Active App Builds' => $devices['versions_summary'],
        ];

        if ($downloads['total'] > 0) {
            $pwaRows['Installer Downloads'] = $downloads['summary'];
        }

        $frontendBase = rtrim((string) config('app.frontend_url', 'https://dumosrx.com'), '/');

        return [
            'title' => "Daily Platform Summary ({$dateString})",
            'lines' => [
                "Platform briefing for {$day->format('D, j M Y')} (00:00–23:59 WAT) across live non-demo stores.",
            ],
            'details' => [
                'subject' => "📊 DumosRx Daily Platform Summary ({$day->format('D, j M Y')})",
                'severity' => $hasWarnings ? 'warning' : 'summary',
                'badge' => 'Daily Platform Brief',
                'meta' => [
                    'Report Window' => "{$day->format('D, j M Y')} (WAT)",
                    'Scope' => 'Non-demo live stores',
                ],
                'metrics' => [
                    [
                        'label' => 'Stores Synced (24h)',
                        'value' => number_format($fleet['stores_synced']),
                        'hint' => number_format($fleet['total_stores']).' live fleet stores',
                    ],
                    [
                        'label' => 'PWA & Device Tills',
                        'value' => number_format($devices['total']),
                        'hint' => "{$devices['pwa']} PWA · {$devices['desktop']} desktop",
                    ],
                    [
                        'label' => 'POS Sales (24h)',
                        'value' => number_format($commerce['sales_count']),
                        'hint' => $commerce['sales_formatted'],
                    ],
                    [
                        'label' => 'Subscription Cash',
                        'value' => $billing['cash_formatted'],
                        'hint' => "{$billing['tx_count']} successful payments",
                    ],
                    [
                        'label' => 'Sync Acceptance',
                        'value' => $health['rate_display'],
                        'hint' => "{$health['accepted']} ok · {$health['refused']} refused",
                    ],
                    [
                        'label' => 'Open Attention',
                        'value' => number_format($attentionCount),
                        'hint' => "{$health['open_tickets']} tickets · {$health['sync_failures']} sync failures",
                    ],
                ],
                'sections' => [
                    [
                        'heading' => 'PWA & Client Activity (24h)',
                        'rows' => $pwaRows,
                    ],
                    [
                        'heading' => 'Growth & Subscriptions',
                        'rows' => [
                            'New Store Owners' => "+{$fleet['new_owners']} yesterday ({$fleet['active_owners']} active owners total)",
                            'New Stores Created' => "+{$fleet['new_stores']} yesterday ({$fleet['total_stores']} live stores)",
                            'New Staff Accounts' => "+{$fleet['new_staff']} yesterday",
                            'Trials Started' => "+{$billing['trials_started']} yesterday ({$billing['active_trials']} active trials)",
                            'Paid Plans Activated' => "+{$billing['paid_started']} yesterday ({$billing['active_paid']} active paid)",
                            'Expiring in Next 7 Days' => "{$billing['expiring_paid']} paid · {$billing['expiring_trials']} trials",
                        ],
                    ],
                    [
                        'heading' => 'POS Sales & Storefront Commerce',
                        'rows' => [
                            'POS Transactions' => "{$commerce['sales_count']} sales · {$commerce['sales_formatted']}",
                            'Storefront Orders (24h)' => "{$commerce['orders_count']} placed ({$commerce['orders_paid']} paid) · {$commerce['orders_formatted']}",
                            'Pending Fulfilment' => "{$commerce['orders_pending_total']} open storefront orders fleet-wide",
                        ],
                        'items' => $commerce['top_stores'],
                    ],
                    [
                        'heading' => 'Sync Health, Backups & Support',
                        'rows' => [
                            'Sync Volume (24h)' => "{$health['pushes']} pushes · {$health['accepted']} accepted · {$health['refused']} refused · {$health['conflicted']} conflicts",
                            'Sync Failures (24h)' => $health['failures_summary'],
                            'Support & Device Reports' => "{$health['new_tickets']} new yesterday · {$health['open_tickets']} pending open",
                            'Security Events (24h)' => "{$health['security_events']} alerts",
                            'Nightly DB Backup Config' => config('database_backup.bucket') ? 'Configured (R2)' : 'Not configured',
                        ],
                    ],
                ],
                'action' => [
                    'label' => 'Open Operations & Health',
                    'url' => $frontendBase.'/admin/operations',
                ],
            ],
        ];
    }

    /**
     * @param  array{total: int, pwa: int, desktop: int, unlabeled: int}  $devices
     */
    private function formatDeviceBreakdown(array $devices): string
    {
        $parts = ["{$devices['pwa']} PWA/Web", "{$devices['desktop']} Desktop"];
        if ($devices['unlabeled'] > 0) {
            $parts[] = "{$devices['unlabeled']} Unlabeled";
        }

        return "{$devices['total']} distinct (".implode(', ', $parts).')';
    }
}
