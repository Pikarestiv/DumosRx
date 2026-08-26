@component('mail::message')
# End of Day Summary
**Date:** {{ $metrics['date'] }}

Hello {{ $user->first_name }},

Here is your end-of-day store performance summary.

@component('mail::panel')
### Financial Pulse
- **Gross Sales:** ₦{{ number_format($metrics['gross_sales'], 2) }}
- **Expenses:** ₦{{ number_format($metrics['expenses'], 2) }}
- **Net Pulse:** ₦{{ number_format($metrics['net_pulse'], 2) }}
@endcomponent

### Operational Volume
- **Total Transactions:** {{ $metrics['transactions'] }}
- **Prescriptions Processed:** {{ $metrics['prescriptions'] }}

### Inventory Alerts
- **Low Stock Items:** {{ $metrics['low_stock'] }}

@component('mail::button', ['url' => config('app.client_app_url') . '/dashboard'])
View Full Dashboard
@endcomponent

Thanks,<br>
{{ config('app.name') }}
@endcomponent
