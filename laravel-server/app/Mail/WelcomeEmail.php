<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeEmail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $user;
    public $storeName;
    public $loginUrl;

    /**
     * Create a new message instance.
     */
    public function __construct($user, $storeName)
    {
        $this->user = $user;
        $this->storeName = $storeName;
        $this->loginUrl = config('app.frontend_url', env('NEXT_PUBLIC_API_URL', 'https://rx.dumostech.com')) . '/login';
    }

    /**
     * Build the message.
     */
    public function build()
    {
        $template = \App\Models\EmailTemplate::where('key', 'welcome')->first();
        
        $subject = $template ? $template->subject : ('Welcome to DumosRx - ' . $this->storeName);
        $htmlContent = $template ? $template->content : null;

        if ($htmlContent) {
            $html = \Illuminate\Support\Facades\Blade::render($htmlContent, [
                'user' => $this->user,
                'storeName' => $this->storeName,
                'loginUrl' => $this->loginUrl
            ]);
            return $this->subject($subject)->html($html);
        }

        return $this->subject($subject)
                    ->view('emails.welcome');
    }
}
