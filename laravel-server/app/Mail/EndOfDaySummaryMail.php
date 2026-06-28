<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\User;
use App\Models\Subscription;
use App\Models\Sale;
use App\Models\Expense;
use App\Models\Prescription;
use App\Models\StockBatch;
use Carbon\Carbon;

class EndOfDaySummaryMail extends Mailable
{
    use Queueable, SerializesModels;

    public $user;
    public $subscription;
    public $metrics;

    /**
     * Create a new message instance.
     */
    public function __construct(User $user, Subscription $subscription)
    {
        $this->user = $user;
        $this->subscription = $subscription;
        
        $today = Carbon::today();
        
        // Aggregate metrics for this user's tenant
        $sales = Sale::where('user_id', $user->id)
            ->whereDate('created_at', $today)
            ->get();
            
        $expenses = Expense::where('user_id', $user->id)
            ->whereDate('created_at', $today)
            ->sum('amount');
            
        $prescriptionsCount = Prescription::where('user_id', $user->id)
            ->whereDate('created_at', $today)
            ->count();
            
        $lowStockCount = StockBatch::where('user_id', $user->id)
            ->whereColumn('quantity', '<=', 'reorder_level')
            ->count();

        $grossSales = $sales->sum('total_amount');
        
        $this->metrics = [
            'gross_sales' => $grossSales,
            'expenses' => $expenses,
            'net_pulse' => $grossSales - $expenses,
            'transactions' => $sales->count(),
            'prescriptions' => $prescriptionsCount,
            'low_stock' => $lowStockCount,
            'date' => $today->format('F j, Y'),
        ];
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your DumosRx End-of-Day Summary',
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            markdown: 'emails.end-of-day-summary',
            with: [
                'metrics' => $this->metrics,
                'user' => $this->user,
            ]
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [];
    }
}
