# DumosRx - Pharmacy Management System

*A comprehensive pharmacy management solution for Nigerian pharmacies*

[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Powered by Laravel](https://img.shields.io/badge/Powered%20by-Laravel-FF2D20?style=for-the-badge&logo=laravel)](https://laravel.com)
[![Database](https://img.shields.io/badge/Database-MySQL-4479A1?style=for-the-badge&logo=mysql)](https://mysql.com)

## 🏥 Overview

DumosRx is a modern, comprehensive pharmacy management system specifically designed for Nigerian pharmacies. It provides a robust solution that handles medicine inventory, sales transactions, prescription management, and business analytics, tailored for the local market.

### 🎯 Key Features

- **🔐 Role-Based Authentication** - Super Admin, Manager, Pharmacist, Sales Staff, Auditor roles
- **💊 Medicine Database** - Management of Nigerian medicines with NAFDAC compliance support
- **📦 Inventory Management** - Real-time stock tracking, batch management, expiry alerts
- **🛒 Point of Sale (POS)** - Complete transaction processing with Nigerian payment methods
- **📋 Prescription Management** - Digital prescription handling and dispensing tracking
- **👥 Customer & Loyalty** - Customer profiles, loyalty points, membership tiers
- **📊 Business Intelligence** - Comprehensive analytics and reporting dashboards
- **🏢 Supplier Management** - Vendor relationships and purchase order tracking

### 🇳🇬 Nigerian-Specific Features

- **NAFDAC Compliance** - Medicine registration and regulatory compliance
- **Naira Currency** - Proper ₦ formatting and 7.5% VAT calculations
- **Local Suppliers** - Nigerian pharmaceutical distributors and manufacturers
- **Payment Integration** - Support for local payment methods (planned)

## 🏗️ Architecture

This repository contains two independently deployable applications:

```
dumosrx/
├── client/                 # Next.js Frontend
│   ├── app/               # Next.js App Router
│   ├── components/        # Shadcn/ui React Components
│   ├── lib/              # Client utilities & API client
│   ├── hooks/            # Custom React hooks
│   ├── public/           # Static assets
│   ├── package.json      # Frontend dependencies
│   └── next.config.mjs   # Next.js configuration
├── laravel-server/         # Laravel Backend
│   ├── app/              # Core Application Logic (Models, Controllers)
│   ├── routes/           # API Routes
│   ├── database/         # Migrations & Seeders
│   ├── bootstrap/        # App Bootstrap & Middleware
│   ├── tests/            # Feature & Unit Tests
│   └── composer.json     # Backend dependencies
└── .github/              # CI/CD Workflows
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 8+
- PHP 8.2+ and Composer (for local backend)
- MySQL 5.7+ or 8.0+
- Git

### 1. Clone Repository

```bash
git clone <repository-url>
cd dumosrx
```

### 2. Setup Frontend (Client)

```bash
cd client
npm install
```

Create `.env.local` in the client folder (optional, defaults to remote API if not set, or local if configured):
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
```

### 3. Setup Backend (Laravel Server)

```bash
cd ../laravel-server
composer install
cp .env.example .env
php artisan key:generate
```

Configure your `.env` file with your local database credentials:
```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=dumosrx
DB_USERNAME=root
DB_PASSWORD=
```

### 4. Database Setup

Run the migrations and seeders:
```bash
php artisan migrate --seed
```

### 5. Run Applications

**Start Backend (Terminal 1):**
```bash
cd laravel-server
php artisan serve
```
Backend runs on: http://127.0.0.1:8000

**Start Frontend (Terminal 2):**
```bash
cd client
npm run dev
```
Frontend runs on: http://localhost:3000

## 🚀 Deployment

### 1. Backend Deployment
The backend is deployed to a shared hosting environment via FTP/Git.
- **Push to Main**: Commits pushed to `main` branch trigger the deployment workflow.
- **Environment**: The production `.env` is securely managed on the server.
- **Migrations**: Access `/migrate-db?key=<secret>` to run pending migrations if shell access is restricted.

### 2. Frontend Deployment
The frontend can be deployed to Vercel, Netlify, or any Node.js hosting.

## 🔑 Default Login Credentials

After running the database seeders, use these default credentials:

```
Super Admin:
Email: admin@rx.dumostech.com
Password: password
```

## 🛠️ Technology Stack

### Frontend (Client)
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Shadcn/ui** - Reusable component library
- **Lucide React** - Iconography
- **Zustand** - State management
- **TanStack Query** - Server state management

### Backend (Server)
- **Laravel 11** - Modern PHP Framework
- **MySQL** - Relational Database
- **Sanctum** - API Token Authentication
- **Eloquent ORM** - Active Record implementation
- **Pest/PHPUnit** - Testing

## � Documentation

- **[API Documentation](docs/API.md)** - (Coming Soon)
- **[Database Schema](docs/DATABASE.md)** - (Coming Soon)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**DumosRx** - Modernizing Nigerian pharmacy operations, one prescription at a time. 🇳🇬
