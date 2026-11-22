<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class SuperAdminAlertMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $alertTitle;

    /** @var array<int, string> */
    public array $messageLines;

    /** @var array<string, mixed> */
    public array $details;

    /**
     * @param  array<int, string>|string  $messageLines
     * @param  array<string, mixed>  $details
     */
    public function __construct(string $alertTitle, array|string $messageLines = [], array $details = [])
    {
        $this->alertTitle = $alertTitle;
        $this->messageLines = array_values(array_map(
            static fn ($line): string => (string) $line,
            (array) $messageLines,
        ));
        $this->details = $details;
    }

    public function build(): self
    {
        return $this->subject($this->resolveSubject())
            ->view('emails.super-admin-alert', $this->buildAlertData());
    }

    private function resolveSubject(): string
    {
        $custom = $this->details['subject'] ?? null;
        if (is_string($custom) && trim($custom) !== '') {
            return trim($custom);
        }

        return '🔔 DumosRx Admin Alert: '.$this->alertTitle;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildAlertData(): array
    {
        $severity = $this->resolveSeverity();
        $env = strtolower((string) config('app.env', 'production'));
        $frontendBase = rtrim((string) config('app.frontend_url', 'https://dumosrx.com'), '/');
        $adminPortalUrl = $frontendBase.'/admin';
        $appUrl = (string) config('app.url', 'https://api.dumosrx.com');
        $host = parse_url($appUrl, PHP_URL_HOST);

        $badge = is_string($this->details['badge'] ?? null) && trim($this->details['badge']) !== ''
            ? trim($this->details['badge'])
            : $this->defaultBadgeForSeverity($severity);

        return [
            'alertTitle' => $this->alertTitle,
            'severity' => $severity,
            'badge' => $badge,
            'palette' => $this->paletteForSeverity($severity),
            'environment' => strtoupper($env),
            'isProduction' => $env === 'production',
            'host' => is_string($host) && $host !== '' ? $host : $appUrl,
            'occurredAtLagos' => now('Africa/Lagos')->format('D, j M Y · H:i').' WAT',
            'occurredAtUtc' => now('UTC')->format('Y-m-d H:i').' UTC',
            'meta' => $this->normalizeMeta($this->details['meta'] ?? null),
            'metrics' => $this->normalizeMetrics($this->details['metrics'] ?? null),
            'blocks' => $this->parseMessageLines($this->messageLines),
            'sections' => $this->normalizeSections($this->details['sections'] ?? null),
            'action' => $this->normalizeAction($this->details['action'] ?? null, $adminPortalUrl),
            'adminPortalUrl' => $adminPortalUrl,
        ];
    }

    private function resolveSeverity(): string
    {
        $explicit = $this->details['severity'] ?? null;
        if (is_string($explicit) && in_array($explicit, ['critical', 'warning', 'success', 'summary', 'info'], true)) {
            return $explicit;
        }

        $haystack = strtolower($this->alertTitle);

        return match (true) {
            str_contains($haystack, 'failed'),
            str_contains($haystack, 'orphaned'),
            str_contains($haystack, 'critical'),
            str_contains($haystack, 'error') => 'critical',
            str_contains($haystack, 'mismatch'),
            str_contains($haystack, 'refund'),
            str_contains($haystack, 'dispute'),
            str_contains($haystack, 'failing'),
            str_contains($haystack, 'no order') => 'warning',
            str_contains($haystack, 'payment successful'),
            str_contains($haystack, 'new registration'),
            str_contains($haystack, 'first-time sync') => 'success',
            str_contains($haystack, 'daily'),
            str_contains($haystack, 'summary') => 'summary',
            default => 'info',
        };
    }

    /**
     * @return array{headerBg: string, accent: string}
     */
    private function paletteForSeverity(string $severity): array
    {
        return match ($severity) {
            'critical' => ['headerBg' => '#b91c1c', 'accent' => '#dc2626'],
            'warning' => ['headerBg' => '#b45309', 'accent' => '#d97706'],
            'success' => ['headerBg' => '#047857', 'accent' => '#059669'],
            'summary' => ['headerBg' => '#3730a3', 'accent' => '#4f46e5'],
            default => ['headerBg' => '#1e40af', 'accent' => '#2563eb'],
        };
    }

    private function defaultBadgeForSeverity(string $severity): string
    {
        return match ($severity) {
            'critical' => 'CRITICAL ALERT',
            'warning' => 'ACTION NEEDED',
            'success' => 'MILESTONE',
            'summary' => 'DAILY BRIEF',
            default => 'SYSTEM ALERT',
        };
    }

    /**
     * @param  array<int, string>  $lines
     * @return array<int, array<string, mixed>>
     */
    private function parseMessageLines(array $lines): array
    {
        $blocks = [];
        $breakPending = false;

        foreach ($lines as $rawLine) {
            $trimmed = trim($rawLine);

            if ($trimmed === '') {
                $breakPending = true;

                continue;
            }

            $lastIdx = count($blocks) - 1;

            if (str_starts_with($trimmed, '- ')) {
                $item = substr($trimmed, 2);
                if (! $breakPending && $lastIdx >= 0 && $blocks[$lastIdx]['type'] === 'list') {
                    $blocks[$lastIdx]['items'][] = $item;
                } else {
                    $blocks[] = ['type' => 'list', 'items' => [$item]];
                }
                $breakPending = false;

                continue;
            }

            if (! str_contains($trimmed, "\n") && preg_match('/^([A-Za-z0-9][A-Za-z0-9 \/\.\(\)_#-]{1,40}):\s+(.+)$/', $trimmed, $matches) === 1) {
                $row = ['label' => trim($matches[1]), 'value' => trim($matches[2])];
                if (! $breakPending && $lastIdx >= 0 && $blocks[$lastIdx]['type'] === 'kv') {
                    $blocks[$lastIdx]['rows'][] = $row;
                } else {
                    $blocks[] = ['type' => 'kv', 'rows' => [$row]];
                }
                $breakPending = false;

                continue;
            }

            $blocks[] = ['type' => 'paragraph', 'text' => $trimmed];
            $breakPending = false;
        }

        return $blocks;
    }

    /**
     * @return array<string, string>
     */
    private function normalizeMeta(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $meta = [];
        foreach ($raw as $key => $value) {
            $label = trim((string) $key);
            $text = trim((string) $value);
            if ($label !== '' && $text !== '') {
                $meta[$label] = $text;
            }
        }

        return $meta;
    }

    /**
     * @return array<int, array{label: string, value: string, hint: string|null}>
     */
    private function normalizeMetrics(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $metrics = [];
        foreach ($raw as $item) {
            if (! is_array($item) || ! isset($item['label'], $item['value'])) {
                continue;
            }

            $metrics[] = [
                'label' => (string) $item['label'],
                'value' => (string) $item['value'],
                'hint' => isset($item['hint']) && trim((string) $item['hint']) !== '' ? (string) $item['hint'] : null,
            ];
        }

        return $metrics;
    }

    /**
     * @return array<int, array{heading: string, rows: array<string, string>, items: array<int, string>}>
     */
    private function normalizeSections(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $sections = [];
        foreach ($raw as $section) {
            if (! is_array($section) || empty($section['heading'])) {
                continue;
            }

            $rows = [];
            if (isset($section['rows']) && is_array($section['rows'])) {
                foreach ($section['rows'] as $k => $v) {
                    $rows[(string) $k] = (string) $v;
                }
            }

            $items = [];
            if (isset($section['items']) && is_array($section['items'])) {
                foreach ($section['items'] as $item) {
                    $text = trim((string) $item);
                    if ($text !== '') {
                        $items[] = $text;
                    }
                }
            }

            if ($rows === [] && $items === []) {
                continue;
            }

            $sections[] = [
                'heading' => (string) $section['heading'],
                'rows' => $rows,
                'items' => $items,
            ];
        }

        return $sections;
    }

    /**
     * @return array{label: string, url: string}
     */
    private function normalizeAction(mixed $raw, string $defaultUrl): array
    {
        if (is_array($raw) && ! empty($raw['label']) && ! empty($raw['url'])) {
            return [
                'label' => (string) $raw['label'],
                'url' => (string) $raw['url'],
            ];
        }

        return [
            'label' => 'Open Admin Portal',
            'url' => $defaultUrl,
        ];
    }
}
