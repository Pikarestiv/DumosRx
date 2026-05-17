<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetEmail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $user;
    public $resetUrl;

    /**
     * Create a new message instance.
     */
    public function __construct($user, $resetUrl)
    {
        $this->user = $user;
        $this->resetUrl = $resetUrl;
    }

    /**
     * Build the message.
     */
    public function build()
    {
        $template = \App\Models\EmailTemplate::where('key', 'password_reset')->first();
        
        $subject = $template ? $template->subject : 'DumosRx Password Reset';
        $htmlContent = $template ? $template->content : null;

        if ($htmlContent) {
            $html = \Illuminate\Support\Facades\Blade::render($htmlContent, [
                'user' => $this->user,
                'resetUrl' => $this->resetUrl
            ]);
            return $this->subject($subject)->html($html);
        }

        return $this->subject($subject)
                    ->view('emails.password-reset');
    }
}
