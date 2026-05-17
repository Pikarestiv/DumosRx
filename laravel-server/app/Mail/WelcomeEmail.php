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
        // The URL for the user to login. They are hitting the front-end React app.
        // Assuming client runs on domain root, or we can use config.
        $this->loginUrl = config('app.frontend_url', env('NEXT_PUBLIC_API_URL', 'https://rx.dumostech.com')) . '/login';
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Welcome to DumosRx - ' . $this->storeName,
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.welcome',
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
