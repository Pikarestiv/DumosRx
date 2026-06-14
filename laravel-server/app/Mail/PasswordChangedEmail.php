<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;
use App\Models\EmailTemplate;
use Illuminate\Support\Facades\Blade;

class PasswordChangedEmail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $user;

    /**
     * Create a new message instance.
     */
    public function __construct($user)
    {
        $this->user = $user;
    }

    /**
     * Build the message.
     */
    public function build()
    {
        $template = EmailTemplate::where('key', 'password_changed')->first();
        
        $subject = $template ? $template->subject : 'Your DumosRx Password Was Changed';
        $htmlContent = $template ? $template->content : null;

        if ($htmlContent) {
            $html = Blade::render($htmlContent, [
                'user' => $this->user,
            ]);
            return $this->subject($subject)->html($html);
        }

        return $this->subject($subject)
                    ->view('emails.security.password-changed');
    }
}
