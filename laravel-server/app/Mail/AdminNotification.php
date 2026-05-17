<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AdminNotification extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $messageText;
    public $subjectLine;

    public function __construct($messageText, $subjectLine = 'DumosRx Platform Notification')
    {
        $this->messageText = $messageText;
        $this->subjectLine = $subjectLine;
    }

    /**
     * Build the message.
     */
    public function build()
    {
        $template = \App\Models\EmailTemplate::where('key', 'notification')->first();
        
        $subject = $template ? $template->subject : $this->subjectLine;
        
        // If template edited by admin, we use that template and override the subject line (if dynamic is active)
        $htmlContent = $template ? $template->content : null;

        if ($htmlContent) {
            $html = \Illuminate\Support\Facades\Blade::render($htmlContent, [
                'messageText' => $this->messageText
            ]);
            return $this->subject($subject)->html($html);
        }

        return $this->subject($subject)
                    ->view('emails.notification');
    }
}
