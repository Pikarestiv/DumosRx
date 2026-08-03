<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @mixin IdeHelperDownloadLog
 */
class DownloadLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'platform',
        'ip_address',
        'user_agent',
    ];
}
