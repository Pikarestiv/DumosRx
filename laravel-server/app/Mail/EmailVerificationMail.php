<?php

namespace App\Mail;

use App\Models\User;
use App\Models\EmailTemplate;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class EmailVerificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public $user;
    public $verificationUrl;
    public $template;

    public function __construct(User $user, string $verificationUrl)
    {
        $this->user = $user;
        $this->verificationUrl = $verificationUrl;
        $this->template = EmailTemplate::where('key', 'email_verification')->first();
    }

    public function build()
    {
        if (!$this->template) {
            Log::error('Email template [email_verification] not found.');
            return $this->subject('Verify Your DumosRx Account')
                        ->html('<p>Please verify your email using this link: <a href="' . $this->verificationUrl . '">' . $this->verificationUrl . '</a></p>');
        }

        if ($this->template && $this->template->content) {
            $html = \Illuminate\Support\Facades\Blade::render($this->template->content, [
                'user' => $this->user,
                'verificationUrl' => $this->verificationUrl,
            ]);
            return $this->subject($this->template->subject)->html($html);
        }

        return $this->subject('Verify Your DumosRx Account')
                    ->html('<p>Please verify your email using this link: <a href="' . $this->verificationUrl . '">' . $this->verificationUrl . '</a></p>');
    }
}
