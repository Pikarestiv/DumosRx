# DumosRx Local Development Setup Guide

This document explains how to run the DumosRx project locally on an external SSD using macOS, Laravel Herd, and DBngin.

## Architecture Overview
- **Backend (Laravel):** Runs on PHP and requires a MySQL database. It acts as the central sync server and cloud data store.
- **Frontend (Client/Web):** Built with React/Next.js/Vite. The local POS app uses a strictly local SQLite database to operate completely offline, periodically syncing with the Laravel backend.

## Prerequisites
1. **Laravel Herd:** A blazingly fast, native Laravel and PHP development environment for macOS. (No Docker needed)
2. **DBngin:** A lightweight local database management tool for macOS (made by the creators of Herd).
3. **Node.js:** To run the frontend applications.

---

## 1. Backend Setup (Laravel Herd & DBngin)

### Database Configuration (DBngin)
1. Open **DBngin** and create a new MySQL server.
2. Start the MySQL service in DBngin.
3. You can use a tool like TablePlus (or any DB client) to connect to `127.0.0.1` on port `3306` with user `root` (no password by default) and create an empty database named `dumosrx` (or whatever your preferred local DB name is).

### Backend Configuration (Laravel Herd)
1. Move your entire `DumosRx` folder to your external SSD.
2. Open **Laravel Herd** and go to **Settings > Paths**.
3. Add the path to your backend folder (e.g., `/Volumes/YourSSD/DumosRx/laravel-server`).
4. Herd will automatically serve your application at `http://laravel-server.test`.
5. Duplicate the `.env.example` file in the `laravel-server` directory to `.env` (if it doesn't already exist).
6. Update the `.env` database connection to point to your DBngin MySQL instance:
   ```env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=dumosrx
   DB_USERNAME=root
   DB_PASSWORD=
   ```
7. Open a terminal in `/laravel-server` and run the migrations to create the tables:
   ```bash
   php artisan migrate
   ```

---

## 2. Frontend Setup (Client & Web)

The frontends need to be pointed to your new local Herd URL instead of the production API.

1. Navigate to your frontend folders (e.g., `/client` and `/web`).
2. Create a `.env.local` file in the root of these frontend projects. This file is Git-ignored and will override the production environment variables locally.
3. Add the local API URL to your `.env.local`:
   ```env
   # For Next.js
   NEXT_PUBLIC_API_URL=http://laravel-server.test/api

   # For Vite
   VITE_API_URL=http://laravel-server.test/api
   ```
   *(Ensure you use the correct variable prefix for your framework)*

4. Open a terminal in each frontend directory, install dependencies, and start the development servers:
   ```bash
   npm install
   npm run dev
   ```

---

## AI Agent Handoff Context

**To any future AI assisting with this project:**
- The user develops this project locally off an external SSD to save Mac memory.
- The stack avoids Docker entirely. It relies on **Laravel Herd** (PHP) and **DBngin** (MySQL) for the backend.
- The `client` app is a local-first application. It uses SQLite locally in the browser/app and pushes/pulls data from the Laravel backend via a `SyncEngine`.
- If the user experiences database connection issues on the backend, ensure DBngin is running.
- If the user experiences CORS or connection issues on the frontend, ensure the `.env.local` is correctly pointing to the `.test` Herd domain and that the backend's `cors.php` config allows requests from the local frontend ports (e.g., `localhost:3001`, `localhost:3002`).
