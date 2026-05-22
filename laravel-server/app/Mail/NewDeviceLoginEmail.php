<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class NewDeviceLoginEmail extends Mailable
{
    use Queueable, SerializesModels;

    public $user;
    public $deviceInfo;
    public $ipAddress;
    public $time;

    /**
     * Create a new message instance.
     */
    public function __construct(User $user, $deviceInfo, $ipAddress, $time)
    {
        $this->user = $user;
        $this->deviceInfo = $deviceInfo;
        $this->ipAddress = $ipAddress;
        $this->time = $time;
    }

    /**
     * Build the message.
     */
    public function build()
    {
        return $this->subject('Security Alert: New Login from Unrecognized Device')
                    ->view('emails.security.new_device');
    }
}
