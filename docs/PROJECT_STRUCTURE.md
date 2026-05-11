# Project Structure - Detailed Guide

Complete file and folder organization for WMSU HRMO Tracker.

## Root Directory

```
wmsu-hrmo-tracker/
├── backend/                              # Node.js + Express backend
├── frontend/                             # React + Vite frontend
├── docs/                                 # 📚 Documentation (NEW)
├── node_modules/                         # Dependencies (git ignored)
├── package.json                          # Root workspace config
├── package-lock.json                     # Dependency lock file
├── .env.example                          # Backend env template
├── .gitignore                            # Git ignore rules
└── README.md                             # Main README
```

## Backend Structure

```
backend/
├── src/                                  # Source code
│   ├── index.ts                         # 🔥 Main server file
│   │   ├── Express setup
│   │   ├── Route handlers
│   │   ├── API endpoints (POST /api/...)
│   │   ├── Middleware (auth, error handling)
│   │   ├── Background jobs (archival)
│   │   └── ~3000 lines of code
│   │
│   ├── db.ts                            # 🗄️ Database layer
│   │   ├── Pool configuration
│   │   ├── initDb() - Schema creation
│   │   ├── query() - Execute SQL
│   │   ├── getArchiveDuration() - Settings
│   │   └── setArchiveDuration() - Update settings
│   │
│   ├── seed.ts                          # 📥 Database seeding
│   │   ├── seedIfEmpty() - Initial data
│   │   ├── ensureTestAccounts() - User creation
│   │   └── ensureDepartments() - Departments
│   │
│   ├── cleanup-applicants.ts            # 🧹 Maintenance utilities
│   ├── cleanup-for-testing.ts           # 🧪 Test data cleanup
│   └── uploads/                         # 📎 Uploaded files
│
├── dist/                                 # Compiled JavaScript (build output)
│   ├── index.js
│   ├── db.js
│   └── ...
│
├── package.json                          # Backend dependencies
├── tsconfig.json                         # TypeScript config
├── .env                                  # Environment (git ignored)
└── README.md                             # Backend-specific docs
```

### Key Backend Files Explained

**index.ts** - The heart of the backend
- 3000+ lines handling everything
- Should be split into separate route files in future

**db.ts** - Database abstraction
- `query()` function wraps pg.query()
- `initDb()` creates all tables on startup
- `getArchiveDuration()` / `setArchiveDuration()` for settings

**Routes Handled in index.ts:**
- `/api/auth/*` - Login, logout, current user
- `/api/jobs/*` - Create, list, update, delete vacancies
- `/api/archived-vacancies/*` - List, restore archived
- `/api/settings/*` - Get/update app settings
- `/api/applications/*` - Application CRUD
- `/api/users/*` - User management (admin)
- `/api/evaluations/*` - Applicant scoring
- And more...

## Frontend Structure

```
frontend/
├── src/
│   ├── main.tsx                         # 🚀 React entry point
│   │   └── Mounts React to #root
│   │
│   ├── App.tsx                          # Main component
│   │   ├── Routes configuration
│   │   ├── Layout wrapper
│   │   └── AuthProvider
│   │
│   ├── index.css                        # Global styles
│   ├── App.css                          # App styles
│   │
│   ├── pages/                           # 📄 Full page components (one per page)
│   │   ├── Dashboard.tsx                # Home/overview
│   │   ├── JobVacancies.tsx             # Job listing & CRUD
│   │   ├── Applicants.tsx               # Applicant management
│   │   ├── ApplicationTracking.tsx      # Application workflow
│   │   ├── Evaluations.tsx              # Scoring interface
│   │   ├── Archive.tsx                  # 🆕 Archived records + Duration settings
│   │   ├── UserManagement.tsx           # User admin (admin only)
│   │   ├── Reports.tsx                  # Analytics
│   │   ├── AuditLogs.tsx                # Change history
│   │   ├── Login.tsx                    # Login page
│   │   ├── LandingPage.tsx              # Public page
│   │   ├── ErrorPage.tsx                # 404 page
│   │   └── Index.tsx                    # Default route
│   │
│   ├── components/                      # 🧩 Reusable components
│   │   ├── ui/                          # 30+ shadcn/ui components
│   │   │   ├── button.tsx               # <Button />
│   │   │   ├── dialog.tsx               # <Dialog />
│   │   │   ├── table.tsx                # <Table />
│   │   │   ├── input.tsx                # <Input />
│   │   │   ├── select.tsx               # <Select />
│   │   │   ├── card.tsx                 # <Card />
│   │   │   ├── form.tsx                 # Form utilities
│   │   │   └── ... (20+ more)
│   │   │
│   │   ├── layout/                      # Layout components
│   │   │   ├── AppLayout.tsx            # Main layout wrapper
│   │   │   ├── Sidebar.tsx              # Navigation sidebar
│   │   │   └── NavLink.tsx              # Nav items
│   │   │
│   │   └── (custom components for specific features)
│   │
│   ├── lib/                             # 🔧 Utilities & helpers
│   │   ├── api.ts                       # API client functions
│   │   │   ├── login() - Auth
│   │   │   ├── fetchJobs() - Get jobs
│   │   │   ├── fetchArchivedVacancies() - Get archived
│   │   │   ├── getArchiveDurationSetting() - Get duration
│   │   │   ├── updateArchiveDurationSetting() - Update duration
│   │   │   └── ... (40+ functions)
│   │   │
│   │   ├── types.ts                     # TypeScript type definitions
│   │   │   ├── User interface
│   │   │   ├── JobVacancy interface
│   │   │   ├── Application interface
│   │   │   └── ... (20+ types)
│   │   │
│   │   ├── utils.ts                     # Utility functions
│   │   │   ├── formatDate()
│   │   │   ├── formatCurrency()
│   │   │   └── ...
│   │   │
│   │   ├── status.ts                    # Status utilities
│   │   ├── mock-data.ts                 # Mock data for testing
│   │   └── vite-env.d.ts                # Vite type definitions
│   │
│   ├── hooks/                           # 🪝 Custom React hooks
│   │   ├── use-mobile.tsx               # Mobile detection
│   │   └── use-toast.ts                 # Toast notifications
│   │
│   ├── contexts/                        # 📦 React contexts
│   │   └── AuthContext.tsx              # Authentication state
│   │       ├── user state
│   │       ├── login()
│   │       ├── logout()
│   │       └── isBootstrapping flag
│   │
│   ├── test/                            # 🧪 Tests
│   │   ├── example.test.ts              # Example test
│   │   └── setup.ts                     # Test setup
│   │
│   ├── public/                          # 📁 Static assets
│   │   └── robots.txt
│   │
│   ├── vite-env.d.ts                    # Vite type defs
│   ├── index.css                        # Global CSS
│   └── main.tsx                         # Vite entry
│
├── dist/                                 # 🏗️ Build output (production)
│   ├── index.html
│   └── assets/
│       ├── *.js                         # Bundled JavaScript
│       └── *.css                        # Bundled CSS
│
├── public/                              # Static files
│   └── robots.txt
│
├── package.json                         # Dependencies & scripts
├── tsconfig.json                        # TypeScript config
├── tsconfig.app.json                    # App-specific config
├── tsconfig.node.json                   # Node config
├── vite.config.ts                       # Vite build config
├── vitest.config.ts                     # Test config
├── tailwind.config.ts                   # Tailwind CSS config
├── postcss.config.js                    # PostCSS config
├── eslint.config.js                     # ESLint config
├── components.json                      # shadcn/ui components config
├── index.html                           # HTML template
└── .env.local                           # Frontend env (git ignored)
```

## Documentation Structure (NEW)

```
docs/                                    # 📚 NEW: Complete documentation
├── README.md                            # Start here
│
├── SETUP.md                             # ⚙️ Setup & Configuration
│   ├── Prerequisites
│   ├── Local dev setup
│   ├── Environment variables
│   ├── Database setup
│   └── Troubleshooting setup
│
├── DEVELOPMENT.md                       # 👨‍💻 Development Workflow
│   ├── Coding standards
│   ├── Backend development
│   ├── Frontend development
│   ├── Testing
│   └── Git workflow
│
├── API.md                               # 🔌 API Reference
│   ├── All endpoints
│   ├── Request/response formats
│   ├── Error codes
│   └── Rate limiting
│
├── ARCHITECTURE.md                      # 🏗️ System Design
│   ├── High-level architecture
│   ├── Technology decisions
│   ├── Data flow
│   ├── Security model
│   └── Scalability
│
├── DATABASE.md                          # 🗄️ Database Schema
│   ├── All tables
│   ├── Relationships
│   ├── Indexes
│   ├── Query examples
│   └── Maintenance
│
├── DEPLOYMENT.md                        # 🚀 Production Deployment
│   ├── Deployment checklist
│   ├── Platform guides
│   │   ├── Heroku
│   │   ├── Railway
│   │   ├── AWS
│   │   └── Docker
│   ├── Post-deployment
│   ├── Monitoring
│   └── Rollback
│
├── TROUBLESHOOTING.md                   # 🔧 Common Issues
│   ├── Development issues
│   ├── Database issues
│   ├── Login issues
│   ├── Production issues
│   ├── Performance issues
│   └── Getting help
│
├── PROJECT_STRUCTURE.md                 # 📋 This file
│   └── What you're reading now
│
└── (more docs as needed)
```

## Key File Relationships

### Backend Request Flow

```
HTTP Request
    ↓
middleware (auth, cors, etc)
    ↓
route handler (app.get, app.post, etc)
    ↓
business logic in index.ts
    ↓
db.query() → PostgreSQL
    ↓
response.json()
    ↓
HTTP Response
```

### Frontend Data Flow

```
User Action (click, submit, etc)
    ↓
Handler function (onClick, onSubmit, etc)
    ↓
API call (fetch via lib/api.ts)
    ↓
React Query (useQuery/useMutation)
    ↓
Backend API
    ↓
Update UI state
    ↓
Component re-renders
    ↓
User sees update
```

### Authentication Flow

```
1. User enters credentials
2. Frontend POSTs /api/auth/login
3. Backend verifies, creates JWT
4. Frontend stores in localStorage
5. Frontend sets AuthContext.user
6. Subsequent requests include JWT
7. requireAuth middleware validates
8. User data available in req.user
```

## Naming Conventions Used

**Files:**
- `PascalCase.tsx` - React components
- `camelCase.ts` - Utilities, hooks, contexts
- `UPPERCASE.md` - Documentation

**Variables/Functions:**
- `camelCase` - Variables and functions
- `PascalCase` - Classes and interfaces
- `CONSTANT_CASE` - Constants

**React Components:**
- `function MyComponent() { }` - Functional components
- Props interfaces end with `Props`

## Build Outputs

### Frontend Build Output (`frontend/dist/`)

```
dist/
├── index.html                           # Entry HTML
├── assets/
│   ├── index-<hash>.js                 # Main bundle
│   ├── index-<hash>.css                # Main styles
│   ├── vendor-<hash>.js                # Dependencies
│   └── ...
```

Size: ~1.1 MB (gzipped: ~307 KB)

### Backend Build Output (`backend/dist/`)

```
dist/
├── index.js                             # Compiled index.ts
├── db.js                                # Compiled db.ts
├── seed.js                              # Compiled seed.ts
└── ...
```

## Important Notes

### ⚠️ Don't modify these files directly in production:
- `backend/.env` - Use environment variables
- Database files - Use migrations
- `frontend/dist/*` - Regenerate with `npm run build`

### 🔒 Files that should NEVER be committed:
- `backend/.env` - Add to .gitignore
- `node_modules/` - Add to .gitignore
- `.DS_Store` - macOS temp files
- Environment-specific files

### 📝 Files to keep updated:
- `README.md` - Project overview
- `docs/API.md` - When adding endpoints
- `docs/DATABASE.md` - When changing schema
- `CHANGELOG.md` - Version history (if you add one)

## IDE Setup Recommendations

### VS Code Extensions
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- PostgreSQL Explorer
- Thunder Client (for API testing)

### VS Code Workspace Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

---

**Last Updated**: May 6, 2026  
**Status**: ✅ Ready for team handoff

For quick navigation, use this file as your map through the codebase!
