<?php

namespace App\Support;

class HostMetrics
{
    /** @return array{1: float, 5: float, 15: float}|null */
    public function loadAverage(): ?array
    {
        if (! function_exists('sys_getloadavg')) {
            return null;
        }

        try {
            $load = @sys_getloadavg();
        } catch (\Throwable $e) {
            return null;
        }

        if (! is_array($load) || ! isset($load[0], $load[1], $load[2])) {
            return null;
        }

        return [
            1 => round((float) $load[0], 2),
            5 => round((float) $load[1], 2),
            15 => round((float) $load[2], 2),
        ];
    }

    /** @return array{used: string, total: string, percent: float}|null */
    public function memory(): ?array
    {
        if (! function_exists('shell_exec')) {
            return null;
        }

        try {
            $free = @shell_exec('free -m');
        } catch (\Throwable $e) {
            return null;
        }

        if (! $free) {
            return null;
        }

        $lines = explode("\n", (string) trim($free));
        if (! isset($lines[1])) {
            return null;
        }

        $mem = preg_split('/\s+/', $lines[1]);
        if (! isset($mem[1], $mem[2]) || ! is_numeric($mem[1]) || ! is_numeric($mem[2])) {
            return null;
        }

        $totalMb = (float) $mem[1];
        $usedMb = (float) $mem[2];
        if ($totalMb <= 0) {
            return null;
        }

        return [
            'used' => round($usedMb / 1024, 1).'GB',
            'total' => round($totalMb / 1024, 1).'GB',
            'percent' => round(($usedMb / $totalMb) * 100, 1),
        ];
    }

    /** @return array{used: string, total: string, percent: float}|null */
    public function disk(): ?array
    {
        if (! function_exists('disk_total_space') || ! function_exists('disk_free_space')) {
            return null;
        }

        try {
            $total = @disk_total_space('/') ?: 0;
            $free = @disk_free_space('/') ?: 0;
        } catch (\Throwable $e) {
            return null;
        }

        if ($total <= 0) {
            return null;
        }

        $used = $total - $free;

        return [
            'used' => round($used / (1024 ** 3), 1).'GB',
            'total' => round($total / (1024 ** 3), 1).'GB',
            'percent' => round(($used / $total) * 100, 1),
        ];
    }
}
