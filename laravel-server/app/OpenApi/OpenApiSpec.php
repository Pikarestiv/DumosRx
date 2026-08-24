<?php

namespace App\OpenApi;

use OpenApi\Attributes as OA;

/**
 * Root OpenAPI document metadata. This class has no runtime behavior; it
 * exists purely so swagger-php has a place to attach the top-level Info,
 * Server, and SecurityScheme definitions when scanning app/.
 */
#[OA\Info(
    version: '1.0.0',
    title: 'DumosRx API',
    description: 'Internal API reference for the DumosRx retail/pharmacy management system. '
        . 'Covers the store-facing app API (`/api/v1/app/*`, `/api/v1/*` staff/store endpoints), '
        . 'the platform admin API (`/api/v1/admin/*`), and public/unauthenticated endpoints '
        . '(auth, storefront checkout, webhooks). Most endpoints require a Sanctum bearer token: '
        . 'log in via `POST /login` to obtain one, then use the "Authorize" button below.',
    contact: new OA\Contact(email: 'support@dumosrx.com'),
)]
#[OA\Server(url: 'https://api.dumosrx.com/api/v1', description: 'Production')]
#[OA\Server(url: 'https://api.dev.dumosrx.com/api/v1', description: 'Staging')]
#[OA\Server(url: 'http://localhost:8000/api/v1', description: 'Local development')]
#[OA\SecurityScheme(
    securityScheme: 'sanctum',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'Token',
    description: 'Laravel Sanctum personal access token, obtained from POST /login. Send as `Authorization: Bearer <token>`.',
)]
#[OA\Tag(name: 'Auth', description: 'Registration, login, password reset, email verification, profile/PIN management.')]
#[OA\Tag(name: 'Products', description: 'Store product catalog.')]
#[OA\Tag(name: 'Categories', description: 'Product categories.')]
#[OA\Tag(name: 'Customers', description: 'Store customers, loyalty, debt balance.')]
#[OA\Tag(name: 'Sales', description: 'POS sales/transactions, returns.')]
#[OA\Tag(name: 'Stock Batches', description: 'Batch-level inventory, expiry, and stock value.')]
#[OA\Tag(name: 'Stock Movements', description: 'Stock ledger: sales, restocks, adjustments, damage/audit writeoffs.')]
#[OA\Tag(name: 'Suppliers', description: 'Vendor/supplier directory.')]
#[OA\Tag(name: 'Purchase Orders', description: 'Procurement / purchase orders to suppliers.')]
#[OA\Tag(name: 'Online Orders', description: 'Orders placed through the public storefront.')]
#[OA\Tag(name: 'Sync', description: 'Offline-first client sync engine (push/pull deltas).')]
#[OA\Tag(name: 'Storefront', description: 'Public, unauthenticated storefront browsing + checkout.')]
#[OA\Tag(name: 'Stores', description: 'Store (tenant) management: the retail business itself.')]
#[OA\Tag(name: 'Staff', description: 'Staff accounts belonging to a store.')]
#[OA\Tag(name: 'Sessions', description: 'Active login session management.')]
#[OA\Tag(name: 'Subscription', description: 'Plan/billing status, payment initiation and verification.')]
#[OA\Tag(name: 'Backups', description: 'Manual data backup upload/download.')]
#[OA\Tag(name: 'Dashboard', description: 'Store dashboard summary metrics.')]
#[OA\Tag(name: 'Notifications', description: 'In-app alerts for the logged-in user.')]
#[OA\Tag(name: 'Activity Logs', description: 'Audit trail / client error logging.')]
#[OA\Tag(name: 'Feedback', description: 'User-submitted support/feedback tickets.')]
#[OA\Tag(name: 'Announcements', description: 'Platform broadcast announcements.')]
#[OA\Tag(name: 'System Config', description: 'Key/value platform configuration.')]
#[OA\Tag(name: 'Webhooks', description: 'Inbound payment-provider webhooks (Paystack, Flutterwave). Not for manual use.')]
#[OA\Tag(name: 'Tracking', description: 'Download/install event tracking.')]
#[OA\Tag(name: 'Admin', description: 'Platform admin: stores, users, search, health, product standardization.')]
#[OA\Tag(name: 'Admin: Coupons', description: 'Platform admin: discount coupons for subscriptions.')]
#[OA\Tag(name: 'Admin: Email Templates', description: 'Platform admin: transactional email template management.')]
#[OA\Tag(name: 'Admin: Mail', description: 'Platform admin: one-off outbound mail.')]
#[OA\Tag(name: 'Admin: Referrals', description: 'Platform admin: referral program settings and credit adjustments.')]
class OpenApiSpec
{
}
