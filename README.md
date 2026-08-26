# DumosRx

*Offline-first retail & pharmacy management for Nigerian stores*

[![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Laravel](https://img.shields.io/badge/Laravel_11-FF2D20?style=for-the-badge&logo=laravel)](https://laravel.com)
[![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?style=for-the-badge&logo=tauri)](https://tauri.app)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql)](https://mysql.com)

## Overview

DumosRx is a retail and pharmacy management system for Nigerian stores, covering inventory, point-of-sale, prescriptions, procurement, and multi-store business analytics, with NAFDAC-aware medicine data, Naira formatting, and 7.5% VAT built in.

The defining architectural choice is that the store-floor app (`client/`) is **offline-first**: it runs against a local SQLite database and keeps working with no internet connection, syncing to the cloud in the background whenever one's available. It ships as a native desktop/mobile app via Tauri, and, from the exact same codebase, as a static web build.

## Applications

This is a monorepo with three independently deployable apps:

```
DumosRx/
├── client/            # Offline-first POS & inventory app (Next.js + Tauri)
│   ├── app/            # Next.js App Router pages
│   ├── components/     # UI components (shadcn/ui)
│   ├── lib/db/          # Local SQLite layer + sync engine (push.ts/pull.ts)
│   ├── src-tauri/       # Tauri native shell (desktop + Android/iOS)
│   └── next.config.mjs  # output: "export": static build, no server
├── web/                # Account, subscription & admin dashboard (Next.js)
└── laravel-server/     # API backend (Laravel)
    ├── app/              # Models, controllers, services
    ├── database/         # Migrations & seeders
    └── routes/           # API routes
```

- **`client/`**: the actual point-of-sale/inventory app used in-store, and the only place a store owner authenticates or manages their dashboard. A local SQLite database (via `sql.js` in the browser, the native Tauri SQL plugin in packaged builds) is the source of truth at runtime; a sync engine reconciles it against the backend whenever online. Ships three ways from one codebase: Tauri desktop app, Tauri Android/iOS, and a static web build deployed to `app.dumosrx.com`.
- **`web/`**: the public marketing site and platform-admin console, deployed to `dumosrx.com`. It no longer performs store-owner authentication itself: `/login` and every "Go to Dashboard" link redirect straight to `app.dumosrx.com`. Admin actions that need to act as a specific store (impersonation) cross that origin boundary via a short-lived, single-use handoff code (`AuthHandoffController`, `client/app/auth/callback`, `web/app/admin/handoff`) rather than passing a real token through the URL.
- **`laravel-server/`**: the API every store's data syncs through: auth, multi-store/multi-tenant scoping, subscriptions, sync push/pull endpoints, and the cross-origin auth handoff. Deployed to `api.dumosrx.com`.

> **In progress:** `web/` still has its own copy of the store dashboard (staff, store profile, etc.) inherited from before this consolidation. It's being migrated into `client/` in phases; the auth handoff above is phase 1. Don't build new dashboard features in `web/`, they belong in `client/` now.

## Quick Start

### Prerequisites

- Node.js 20+ and npm
- PHP 8.2+ and Composer
- MySQL 5.7+ or 8.0+
- Rust (only if building the Tauri desktop/mobile app; not needed for `next dev`)

### 1. Clone & install

```bash
git clone <repository-url>
cd DumosRx
```

### 2. Backend (`laravel-server/`)

```bash
cd laravel-server
composer install
cp .env.example .env
php artisan key:generate
```

Set your local DB in `.env` (matches `.env.example`'s defaults):
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=dumosrx_db
DB_USERNAME=root
DB_PASSWORD=
```

```bash
php artisan migrate --seed
php artisan serve
```
Runs on `http://127.0.0.1:8000`.

### 3. Client (`client/`): the POS app

```bash
cd client
npm install
```

Create `client/.env.local` to point at your local backend:
```env
NEXT_PUBLIC_API_URL_LOCAL_NODE=http://localhost:8000/api/v1
```

```bash
npm run dev
```
Runs on `http://localhost:3000`. To build/run the native Tauri app instead: `npm run tauri dev`.

### 4. Web dashboard (`web/`)

```bash
cd web
npm install
npm run dev
```

Runs on `http://localhost:3001` (Next.js picks the next free port after `client/`'s 3000). Since `web/`'s login and admin-impersonation flows now redirect into `client/`, point it at your local `client/` instead of the production `app.dumosrx.com`: open `web`'s login screen, use its "Server Config" panel to set the App URL to `http://localhost:3000`, or run `localStorage.setItem("dumos_app_url", "http://localhost:3000")` in the browser console.

### Default login (after seeding)

```
Email: admin@dumosrx.com
Password: Admin123#
```

## Deployment

All deployment is via GitHub Actions (`.github/workflows/`), FTP-syncing static builds:

| App | Trigger | Target |
|---|---|---|
| `client/` (web build) | push to `main` | `app.dumosrx.com` |
| `web/` | push to `main` | `dumosrx.com` |
| `laravel-server/` | push to `main` | `api.dumosrx.com` |
| `web/` + `laravel-server/` | push to `dev` | `dev.dumosrx.com` / `api.dev.dumosrx.com` |
| `client/` (web build) | push to `dev` | `app.dev.dumosrx.com` |
| `client/` (Tauri desktop/Android) | git tag `v*` | GitHub Releases + in-app updater |

Branch convention: feature work merges into `dev`; a `dev → main` PR is raised when a batch is ready to release.

## Tech Stack

**`client/`**: Next.js 15 (static export), TypeScript, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, Tauri 2 (Rust), sql.js / `@tauri-apps/plugin-sql`, Sentry.

**`web/`**: Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query.

**`laravel-server/`**: Laravel 11, PHP 8.2, MySQL, Sanctum (API auth), Eloquent, PHPUnit/Pest.

## Contributing

1. Branch off `dev` (not `main`)
2. Commit your changes
3. Push and open a PR against `dev`
4. `dev → main` PRs are raised separately as a release batch

## License

Proprietary. All rights reserved.
