<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * @mixin IdeHelperNotification
 */
class Notification extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'title',
        'message',
        'type',
        'is_read',
    ];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Notify a set of users in one bulk insert instead of a create() per
     * user. Bypasses the creating() event above (insert() doesn't fire
     * model events), so id/timestamps are generated here instead.
     */
    public static function bulkCreateFor(iterable $userIds, array $attributes): void
    {
        $now = now();
        $rows = [];
        foreach ($userIds as $userId) {
            $rows[] = array_merge([
                'is_read' => false,
            ], $attributes, [
                'id' => (string) Str::uuid(),
                'user_id' => $userId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        if ($rows) {
            static::insert($rows);
        }
    }
}
