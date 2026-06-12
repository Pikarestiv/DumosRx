<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class SuperAdminAlertMail extends Mailable
{
    use Queueable, SerializesModels;

    public $alertTitle;
    public $messageLines;

    /**
     * Create a new message instance.
     *
     * @param string $alertTitle
     * @param array $messageLines
     * @return void
     */
    public function __construct($alertTitle, $messageLines)
    {
        $this->alertTitle = $alertTitle;
        $this->messageLines = is_array($messageLines) ? $messageLines : [$messageLines];
    }

    /**
     * Build the message.
     *
     * @return $this
     */
    public function build()
    {
        return $this->subject('🔔 DumosRx Admin Alert: ' . $this->alertTitle)
                    ->html($this->buildHtmlContent());
    }

    private function buildHtmlContent()
    {
        $lines = array_map(function($line) {
            return "<p style='margin-bottom: 15px;'>{$line}</p>";
        }, $this->messageLines);

        $content = implode('', $lines);

        return "
        <div style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;'>
            <div style='background-color: #2563eb; color: #fff; padding: 20px; text-align: center;'>
                <h2 style='margin: 0;'>DumosRx Super Admin Alert</h2>
            </div>
            <div style='padding: 20px; background-color: #f9fafb;'>
                <h3 style='color: #1e40af; margin-top: 0;'>{$this->alertTitle}</h3>
                {$content}
            </div>
            <div style='background-color: #f1f5f9; padding: 10px; text-align: center; font-size: 12px; color: #64748b;'>
                This is an automated alert from DumosRx System.
            </div>
        </div>
        ";
    }
}
