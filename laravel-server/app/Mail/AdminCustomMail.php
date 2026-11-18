<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AdminCustomMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $subjectLine;

    public $messageBody;

    public bool $isHtml;

    /**
     * Create a new message instance.
     */
    public function __construct($subjectLine, $messageBody, bool $isHtml = false)
    {
        $this->subjectLine = $subjectLine;
        $this->messageBody = $messageBody;
        $this->isHtml = $isHtml;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->subjectLine,
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.admin_custom_mail',
            with: [
                'messageBody' => $this->messageBody,
                'isHtml' => $this->isHtml,
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
