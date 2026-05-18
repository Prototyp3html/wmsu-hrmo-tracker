# WMSU HRMO Tracker

A comprehensive Human Resources Management Office (HRMO) application for Western Mindanao State University (WMSU).

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Documentation](#documentation)
- [Setup & Configuration](#setup--configuration)
- [Development](#development)
- [Deployment](#deployment)
- [System Features](#system-features)
- [Recent Changes](#recent-changes)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 12+
- npm

### One-Command Setup

```bash
npm install
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:4000

Or run individually:
```bash
npm run dev:frontend
npm run dev:backend
```

## 📁 Project Structure

```
wmsu-hrmo-tracker/
├── backend/                         # Node.js + Express + PostgreSQL
│   ├── src/
│   │   ├── index.ts                # Main server, routes, API endpoints
│   │   ├── db.ts                   # Database schema, initialization, helpers
│   │   ├── seed.ts                 # Database seeding scripts
│   │   └── cleanup-*.ts            # Data maintenance utilities
│   ├── dist/                       # Compiled output
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                        # Backend configuration (not in git)
│
├── frontend/                        # React + TypeScript + Vite
│   ├── src/
│   │   ├── main.tsx                # React entry point
│   │   ├── App.tsx                 # Main app component
│   │   ├── pages/                  # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── JobVacancies.tsx
│   │   │   ├── Applicants.tsx
│   │   │   ├── ApplicationTracking.tsx
│   │   │   ├── Evaluations.tsx
│   │   │   ├── Archive.tsx         # ⭐ Archived records + Duration settings
│   │   │   ├── UserManagement.tsx
│   │   │   ├── Reports.tsx
│   │   │   ├── AuditLogs.tsx
│   │   │   └── ...
│   │   ├── components/             # Reusable React components
│   │   │   ├── ui/                 # shadcn/ui components (Button, Dialog, etc.)
│   │   │   └── layout/             # Layout components (Sidebar, AppLayout)
│   │   ├── lib/
│   │   │   ├── api.ts              # API client functions
│   │   │   ├── types.ts            # TypeScript type definitions
│   │   │   ├── utils.ts            # Utility functions
│   │   │   └── status.ts           # Status utilities
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── contexts/               # React Context (Auth)
│   │   └── test/                   # Tests
│   ├── dist/                       # Built production files
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── docs/                            # 📚 NEW: Documentation
│   ├── SETUP.md                    # Detailed setup guide
│   ├── DEVELOPMENT.md              # Development workflow
│   ├── API.md                      # API endpoint reference
│   ├── ARCHITECTURE.md             # System design
│   ├── DATABASE.md                 # Database schema details
│   ├── DEPLOYMENT.md               # Deployment guide
│   └── TROUBLESHOOTING.md          # Common issues & fixes
│
├── .env.example                     # Backend environment template
├── package.json                     # Root package (workspaces)
└── README.md                        # This file
```

**See [docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) for detailed breakdown.**

## 🛠 Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **Authentication**: JWT
- **Email**: Nodemailer
- **File Processing**: Mammoth (DOCX), pdf-parse (PDF)
- **Export**: jsPDF, docx
- **Scheduling**: setInterval for daily jobs

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite 5.4
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (30+ components)
- **State**: TanStack Query + React Context
- **Icons**: Lucide React

## 📚 Documentation

All documentation is in the `/docs` folder:

Operational setup note: WMSU HRMO primarily uses this system through HR staff accounts, and the Head HR (Attorney) serves as the admin account owner.

| Document | For Whom | Purpose |
|----------|----------|---------|
| **[HANDOVER.md](./docs/HANDOVER.md)** ⭐ | Head HR (Admin), HR Staff | First-day onboarding checklist |
| **[SHORTCUTS.md](./docs/SHORTCUTS.md)** | HR Staff | Desktop shortcuts for quick access |
| **[SETUP.md](./docs/SETUP.md)** | Assigned Technical Support | Environment setup, database config, .env variables |
| **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)** | Assigned Technical Support | Development workflow, coding standards, testing |
| **[API.md](./docs/API.md)** | Assigned Technical Support | All API endpoints, request/response formats |
| **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | Head HR (Admin), Assigned Technical Support | System design, data flow, key components |
| **[DATABASE.md](./docs/DATABASE.md)** | Assigned Technical Support | Schema, tables, migrations, relationships |
| **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** | Assigned Technical Support | Production build, cloud deployment options |
| **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** | HR Staff, Head HR (Admin), Assigned Technical Support | Common issues and solutions |

## 🔧 Setup & Configuration

### Backend Environment

Create `backend/.env`:

```env
# Server
PORT=4000
NODE_ENV=development

# Database
DATABASE_URL=postgres://postgres:password@localhost:5432/wmsu_hr_connect

# Authentication
JWT_SECRET=your_jwt_secret_key_min_32_chars
TOKEN_EXPIRES_IN=7d

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
```

See [SETUP.md](./docs/SETUP.md) for complete configuration guide.

## 💻 Development

### Running Locally

```bash
# 1. Install all dependencies
npm install

# 2. Create backend/.env with database credentials
cp .env.example backend/.env

# 3. Start both backend and frontend in development mode
npm run dev

# Or run separately:
npm run dev:backend    # Terminal 1
npm run dev:frontend   # Terminal 2
```

### Building for Production

```bash
npm run build        # Build backend + frontend
npm run build:web    # Single web app build
```

### Testing

```bash
npm run test         # Run tests
npm run lint         # Lint code
```

## 🚀 Deployment

### Quick Deploy to Vercel/Railway/Heroku

See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for:
- Vercel deployment
- Railway deployment
- Heroku deployment
- AWS deployment
- Docker containerization

### Production Build

```bash
# Build backend
cd backend
npm run build
npm start

# Build frontend
cd frontend
npm run build
npm run preview
```

## ⭐ System Features

### Core Functionality
- ✅ **Job Vacancy Management** - Create, edit, publish, and archive vacancies
- ✅ **Application Tracking** - Multi-stage workflow for applicant screening
- ✅ **Evaluations** - Score applicants with scoring system
- ✅ **User Management** - Admin/staff roles with permissions
- ✅ **Email Templates** - Customizable rejection and qualification emails
- ✅ **Archive Management** - Automatic archival with restoration capability
- ✅ **Audit Logging** - Complete audit trail for compliance
- ✅ **Reports** - HR analytics and reporting

### Technical Features
- ✅ JWT-based authentication
- ✅ Role-based access control (RBAC)
- ✅ PostgreSQL database with proper constraints
- ✅ Responsive design (mobile-friendly)
- ✅ Real-time data updates (React Query)
- ✅ File upload & processing (PDF, DOCX)
- ✅ Email notifications
- ✅ Automatic job archival with configurable retention
- ✅ Audit trail for all changes

## 🆕 Recent Changes & Improvements (May 2026)

### Archive Duration Configuration
- **What**: Admins can now adjust vacancy archive retention period (1-180 days)
- **Where**: Archive page, "Set Retention Period" button
- **How**: Settings are stored in `application_settings` table, applied to future archival jobs
- **Why**: Flexible retention policy without code changes or server restart

### Vacancy Lifecycle Management
- **Automatic Archival**: Vacancies with passed closing dates move to archive
- **Automatic Cleanup**: Archived vacancies are permanently deleted after retention period
- **Configurable Duration**: Each archived vacancy can have different retention periods
- **Restoration**: Admins can restore archived vacancies back to active listings

### UI/UX Improvements
- **Themed Delete Dialogs**: All delete confirmations use shadcn/ui Dialog for consistency
- **Better Error Handling**: User-friendly error messages throughout
- **Validation**: Input validation on all forms and settings

## 🔗 Key API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | User login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/jobs` | List all job vacancies |
| POST | `/api/jobs` | Create vacancy |
| GET | `/api/archived-vacancies` | List archived vacancies |
| POST | `/api/archived-vacancies/:id/restore` | Restore archived vacancy |
| **GET** | **`/api/settings/archive-duration`** | **Get retention period** |
| **POST** | **`/api/settings/archive-duration`** | **Update retention period (admin)** |

See [API.md](./docs/API.md) for complete endpoint reference.

## 📞 Support & Handover

### For HR Staff and Head HR (Admin)

1. **Start here**: [SETUP.md](./docs/SETUP.md) - Get development environment running
2. **Understand architecture**: [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Learn the system design
3. **Check API docs**: [API.md](./docs/API.md) - See available endpoints
4. **Learn development**: [DEVELOPMENT.md](./docs/DEVELOPMENT.md) - Coding standards

### Troubleshooting

See [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for:
- "Port already in use"
- "Database connection failed"
- "Module not found"
- "CORS errors"
- And more...

---

**Last Updated**: May 6, 2026  
**Handover Date**: May 7, 2026  
**Status**: ✅ Production Ready

For questions, refer to documentation in `/docs` or coordinate with the Head HR (Admin) and assigned technical support contact.

Start the web app server:

```sh
npm run start:web
```

One-click launcher for non-technical users:

- Double-click `start-web-app.cmd`
- It starts the local server and opens the app in your browser

This is the recommended option if you want it to feel like a normal web app without paying for code signing yet.

Desktop icon setup:

- Double-click `Create Desktop Shortcut.cmd` once
- It creates a `WMSU HRMO Tracker` icon on the desktop
- HR staff can then open the system by clicking that desktop icon

## Workspace layout

- frontend/ - React + TypeScript + Vite UI
- backend/ - Express API + SQLite

## Default credentials (seeded)

- Admin: admin@wmsu.edu.ph / password123
- Staff: hrstaff@wmsu.edu.ph / password123
