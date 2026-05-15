<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class AdminNotification extends Mailable
{
    use Queueable, SerializesModels;

    public $messageText;
    public $subjectLine;

    public function __construct($messageText, $subjectLine = 'DumosRx Platform Notification')
    {
        $this->messageText = $messageText;
        $this->subjectLine = $subjectLine;
    }

    public function build()
    {
        return $this->subject($this->subjectLine)
                    ->html($this->messageText);
    }
}
