<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SyncHealthDaily extends Model
{
    use HasUuids;

    protected $table = 'sync_health_daily';

    protected $fillable = [
        'store_id', 'date', 'pushes', 'changes_accepted', 'changes_refused', 'changes_conflicted', 'changes_queued_peak',
    ];

    protected $casts = [
        'date' => 'date',
        'pushes' => 'integer',
        'changes_accepted' => 'integer',
        'changes_refused' => 'integer',
        'changes_conflicted' => 'integer',
        'changes_queued_peak' => 'integer',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
