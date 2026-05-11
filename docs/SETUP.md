# Setup & Configuration Guide

Complete guide to set up WMSU HRMO Tracker for development and production.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Backend Configuration](#backend-configuration)
- [Frontend Configuration](#frontend-configuration)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required
- **Node.js** 18.0+ ([Download](https://nodejs.org/))
- **npm** 9.0+ (comes with Node.js)
- **PostgreSQL** 12+ ([Download](https://www.postgresql.org/download/))
- **Git** ([Download](https://git-scm.com/))

### Optional
- **pgAdmin** or **DBeaver** - GUI for PostgreSQL
- **Postman** or **Insomnia** - API testing
- **Visual Studio Code** - Code editor

## Local Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd wmsu-hrmo-tracker
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for both backend and frontend (monorepo setup).

### 3. Create Backend Environment File

Copy the template and configure:

```bash
cp .env.example backend/.env
```

Edit `backend/.env` with your settings (see [Environment Variables](#environment-variables) below).

### 4. Database Setup

```bash
# Create PostgreSQL database
createdb wmsu_hr_connect

# Or using pgAdmin:
# 1. Right-click "Databases"
# 2. Create → Database
# 3. Name: wmsu_hr_connect
# 4. Click Create
```

### 5. Start Development Server

```bash
npm run dev
```

This starts both backend and frontend in development mode.

Access:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:4000

## Backend Configuration

### Location
`backend/.env`

### Required Variables

```env
# Server
PORT=4000
NODE_ENV=development

# Database (CRITICAL)
DATABASE_URL=postgres://username:password@localhost:5432/wmsu_hr_connect

# Authentication
JWT_SECRET=your_jwt_secret_key_min_32_chars
TOKEN_EXPIRES_IN=7d
```

### Optional Variables

```env
# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
```

### Database URL Format

```
postgres://username:password@host:port/database
```

**Example:**
```
postgres://postgres:password123@localhost:5432/wmsu_hr_connect
```

### JWT Secret Generation

Generate a secure JWT secret:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

## Frontend Configuration

### Location
`frontend/.env.local`

### Required Variables

```env
VITE_API_URL=http://localhost:4000/api
```

### Optional Variables

```env
VITE_ENABLE_MOCK=false
VITE_MOCK_DELAY=300
```

## Database Setup

### Create Database

```bash
# Using psql
psql -U postgres
CREATE DATABASE wmsu_hr_connect;
\c wmsu_hr_connect
```

### Initialize Schema

Tables are automatically created on first backend startup:
- `users` - User accounts
- `departments` - HR departments
- `job_vacancies` - Job postings
- `applications` - Applicant submissions
- `evaluations` - Applicant assessments
- `archived_vacancies` - Archived job postings
- `audit_logs` - Change history
- `email_templates` - Email message templates
- `application_settings` - System settings

### Database Connection Troubleshooting

**Connection refused:**
```bash
# Check PostgreSQL is running
sudo service postgresql status    # Linux
brew services list | grep postgres # macOS
Get-Service PostgreSQL*            # Windows
```

**Wrong credentials:**
```bash
# Test connection with psql
psql -U postgres -d wmsu_hr_connect -h localhost
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | 4000 | Server port |
| `NODE_ENV` | string | development | Environment mode |
| `DATABASE_URL` | string | *required* | PostgreSQL connection string |
| `JWT_SECRET` | string | *required* | Secret key for JWT signing |
| `TOKEN_EXPIRES_IN` | string | 7d | JWT expiration time |
| `SMTP_HOST` | string | optional | Email server hostname |
| `SMTP_PORT` | number | 587 | Email server port |
| `SMTP_USER` | string | optional | Email account username |
| `SMTP_PASS` | string | optional | Email account password |
| `UPLOAD_DIR` | string | ./uploads | File upload directory |
| `MAX_FILE_SIZE` | number | 52428800 | Max upload size (bytes) |

### Frontend (`frontend/.env.local`)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `VITE_API_URL` | string | http://localhost:4000/api | Backend API URL |
| `VITE_ENABLE_MOCK` | boolean | false | Enable mock data |

## Verification

### Verify Backend is Running

```bash
curl http://localhost:4000/api/health
# or navigate to http://localhost:4000/api/health in browser
```

### Verify Frontend is Running

Navigate to http://localhost:5173 and check:
- Page loads without errors
- Console has no red errors
- Can access login page

### Verify Database Connection

Check backend logs:
```bash
# Look for: "✓ Database connection successful"
```

### Test Login

Use test credentials (if seeded):
- Email: `admin@wmsu.edu`
- Password: `password123`

## Production Setup

### 1. Build Applications

```bash
npm run build
```

### 2. Environment for Production

```bash
# backend/.env
PORT=4000
NODE_ENV=production
DATABASE_URL=postgres://user:pass@prod-db-host:5432/wmsu_hr
JWT_SECRET=<use-strong-secret>
TOKEN_EXPIRES_IN=7d
```

### 3. Deploy Backend

```bash
cd backend
npm run build
npm start
```

### 4. Deploy Frontend

```bash
cd frontend
npm run build
# Serve dist/ with web server (nginx, Apache, etc.)
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed cloud deployment.

## Troubleshooting

### Issue: "Port 4000 already in use"

```bash
# Find process using port 4000
lsof -i :4000                      # macOS/Linux
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess # Windows

# Kill the process
kill -9 <PID>
# or change PORT in backend/.env
```

### Issue: "Cannot connect to database"

1. Verify PostgreSQL is running
2. Check DATABASE_URL syntax
3. Verify database exists
4. Check username/password

```bash
# Test connection
psql -U postgres -d wmsu_hr_connect -h localhost -W
```

### Issue: "Module not found"

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue: Frontend shows "CORS error"

1. Verify `VITE_API_URL` is correct in `frontend/.env.local`
2. Check backend is running on configured port
3. Clear browser cache: Ctrl+Shift+Delete

---

**Need more help?** See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
