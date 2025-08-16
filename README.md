# DumosRx - Pharmacy Management System

*A comprehensive pharmacy management solution for Nigerian pharmacies*

[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Powered by NestJS](https://img.shields.io/badge/Powered%20by-NestJS-red?style=for-the-badge&logo=nestjs)](https://nestjs.com)
[![Database](https://img.shields.io/badge/Database-Supabase-green?style=for-the-badge&logo=supabase)](https://supabase.com)

## 🏥 Overview

DumosRx is a modern, comprehensive pharmacy management system specifically designed for Nigerian pharmacies. It replaces unreliable legacy systems with a robust, offline-first solution that handles medicine inventory, sales transactions, prescription management, and business analytics.

### 🎯 Key Features

- **🔐 Role-Based Authentication** - Super Admin, Manager, Pharmacist, Sales Staff, Auditor roles
- **💊 Medicine Database** - 5,000+ Nigerian medicines with NAFDAC compliance
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
- **Payment Integration** - Support for Paystack, Flutterwave, OPay, and other local payment methods

## 🏗️ Architecture

This repository contains two completely independent applications:

\`\`\`
dumosrx-pharmacy/
├── client/                 # Next.js Frontend (Independent)
│   ├── app/               # Next.js 13+ App Router
│   ├── components/        # React Components
│   ├── lib/              # Client utilities & API client
│   ├── hooks/            # Custom React hooks
│   ├── public/           # Static assets
│   ├── package.json      # Frontend dependencies
│   ├── next.config.mjs   # Next.js configuration
│   └── tsconfig.json     # TypeScript configuration
├── server/                # NestJS Backend (Independent)
│   ├── src/              # NestJS application
│   │   ├── modules/      # Feature modules (auth, medicines, etc.)
│   │   └── main.ts       # Application entry point
│   ├── package.json      # Backend dependencies
│   ├── nest-cli.json     # NestJS CLI configuration
│   └── tsconfig.json     # TypeScript configuration
├── scripts/              # Database migration scripts
└── docs/                 # Additional documentation
\`\`\`

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 8+
- Supabase account and project
- Git

### 1. Clone Repository

\`\`\`bash
git clone <repository-url>
cd dumosrx-pharmacy
\`\`\`

### 2. Setup Frontend (Client)

\`\`\`bash
cd client
npm install
\`\`\`

Create `.env.local` in the client folder:
\`\`\`env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
\`\`\`

### 3. Setup Backend (Server)

\`\`\`bash
cd ../server
npm install
\`\`\`

Create `.env` in the server folder:
\`\`\`env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret_key
CLIENT_URL=http://localhost:3000
PORT=3001
\`\`\`

### 4. Database Setup

Run the database migration scripts in order:

\`\`\`bash
# Execute these SQL scripts in your Supabase SQL editor or via API
scripts/01_create_users_table.sql
scripts/02_create_categories_table.sql
scripts/03_create_suppliers_table.sql
scripts/04_create_medicines_table.sql
scripts/05_create_inventory_table.sql
scripts/06_create_customers_table.sql
scripts/07_create_prescriptions_table.sql
scripts/08_create_sales_table.sql
scripts/09_create_stock_movements_table.sql
scripts/10_create_loyalty_program_table.sql
\`\`\`

### 5. Run Applications

**Start Backend (Terminal 1):**
\`\`\`bash
cd server
npm run start:dev
\`\`\`
Backend runs on: http://localhost:3001

**Start Frontend (Terminal 2):**
\`\`\`bash
cd client
npm run dev
\`\`\`
Frontend runs on: http://localhost:3000

### 6. Production Build

**Build Frontend:**
\`\`\`bash
cd client
npm run build
npm run start
\`\`\`

**Build Backend:**
\`\`\`bash
cd server
npm run build
npm run start:prod
\`\`\`

## 📚 Documentation

- **[API Documentation](docs/API.md)** - Complete REST API reference
- **[Database Schema](docs/DATABASE.md)** - Database structure and relationships
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment instructions

## 🔑 Default Login Credentials

After running the database scripts, use these default credentials:

\`\`\`
Super Admin:
Email: admin@dumosrx.com
Password: Admin123!

Pharmacist:
Email: pharmacist@dumosrx.com  
Password: Pharmacist123!

Sales Staff:
Email: sales@dumosrx.com
Password: Sales123!
\`\`\`

## 🛠️ Technology Stack

### Frontend (Client)
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **React Hook Form** - Form management
- **Recharts** - Data visualization

### Backend (Server)
- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type-safe backend development
- **Supabase** - PostgreSQL database and authentication
- **JWT** - JSON Web Token authentication
- **Swagger** - API documentation

## 🔒 Security Features

- **JWT Authentication** with role-based access control
- **Password Hashing** using bcrypt
- **Input Validation** with class-validator
- **SQL Injection Protection** via parameterized queries
- **CORS Configuration** for secure API access
- **Rate Limiting** on authentication endpoints

## 📊 Business Intelligence

- **Sales Analytics** - Daily, monthly, yearly revenue tracking
- **Inventory Reports** - Stock levels, turnover rates, expiry tracking
- **Customer Insights** - Purchase patterns, loyalty analytics
- **Medicine Performance** - Top-selling products, profitability analysis
- **Operational Metrics** - Staff performance, prescription processing times

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- **Email**: support@dumosrx.com
- **Documentation**: Check the `/docs` folder
- **Issues**: Create a GitHub issue

---

**DumosRx** - Modernizing Nigerian pharmacy operations, one prescription at a time. 🇳🇬
