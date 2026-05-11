# Project Handover - IT Team Onboarding Guide

**Date**: May 6, 2026  
**Handover Date**: May 7, 2026  
**Status**: ✅ Production Ready

Welcome to the WMSU HRMO Tracker project! This document is your starting point for understanding and taking over the codebase.

## 📋 Quick Navigation

**New to the project?** Start here:
1. Read this file (5 min)
2. See [README.md](../README.md) (10 min)
3. Follow [SHORTCUTS.md](./SHORTCUTS.md) to create desktop shortcut (5 min)
4. Follow [SETUP.md](./SETUP.md) to get running locally (30 min)
5. Explore [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) to understand organization

**Need to deploy?**
→ See [DEPLOYMENT.md](./DEPLOYMENT.md)

**Building a new feature?**
→ See [DEVELOPMENT.md](./DEVELOPMENT.md)

**Troubleshooting?**
→ See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

**Understanding the system?**
→ See [ARCHITECTURE.md](./ARCHITECTURE.md)

**Working with API?**
→ See [API.md](./API.md)

**Database questions?**
→ See [DATABASE.md](./DATABASE.md)

## 🎯 Project Overview

### What is WMSU HRMO Tracker?

A full-stack HR management system for Western Mindanao State University built with:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + PostgreSQL
- **Deployment**: Can run anywhere (cloud, server, Docker)

### Key Features

- ✅ Job vacancy management with automatic lifecycle
- ✅ Application tracking through hiring workflow
- ✅ Applicant evaluation/scoring system
- ✅ User management with admin/staff roles
- ✅ Customizable email templates
- ✅ Archive management with configurable retention periods
- ✅ Complete audit logging
- ✅ Reports and analytics

## 📊 Project Stats

| Metric | Value |
|--------|-------|
| Frontend Size | 1.1 MB (307 KB gzipped) |
| Backend | ~3000 lines in index.ts |
| Database Tables | 10 core tables |
| API Endpoints | 40+ endpoints |
| Components | 30+ shadcn/ui components |
| React Query Hooks | Extensive for data management |

## 🚀 Getting Started (First Day)

### Step 1: Setup (30 minutes)

```bash
# 1. Clone repo
git clone <repo-url>
cd wmsu-hrmo-tracker

# 2. Install
npm install

# 3. Create backend/.env
cp .env.example backend/.env
# Edit with your database credentials

# 4. Create database
createdb wmsu_hr_connect

# 5. Run dev server
npm run dev
```

💡 **Tip**: See [SHORTCUTS.md](./SHORTCUTS.md) to create a desktop shortcut for quick access!

Access:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

### Step 2: Verify It Works (10 minutes)

- [ ] Page loads at http://localhost:5173
- [ ] Console has no errors (F12)
- [ ] Can login with test credentials
- [ ] Backend logs show "Database connection successful"

### Step 3: Read Documentation (30 minutes)

1. [ARCHITECTURE.md](./ARCHITECTURE.md) - How it's built
2. [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Where everything is
3. [API.md](./API.md) - Available endpoints

## 📁 File Organization Summary

```
wmsu-hrmo-tracker/
├── backend/                    # Node.js + Express
│   └── src/index.ts           # Main server (3000+ lines)
├── frontend/                   # React + Vite
│   ├── src/pages/             # Page components
│   ├── src/components/        # Reusable UI components
│   └── src/lib/api.ts         # API client
├── docs/                       # 📚 NEW: Documentation
│   ├── SETUP.md               # Setup guide
│   ├── DEVELOPMENT.md         # Dev workflow
│   ├── API.md                 # API reference
│   ├── ARCHITECTURE.md        # System design
│   ├── DATABASE.md            # Database schema
│   ├── DEPLOYMENT.md          # Production deployment
│   ├── TROUBLESHOOTING.md     # Common fixes
│   └── PROJECT_STRUCTURE.md   # File organization
├── .env.example               # Backend env template
└── README.md                  # Main README
```

## 🔑 Important Files to Know

| File | Purpose | Edit? |
|------|---------|-------|
| `backend/src/index.ts` | All API routes + jobs | ✏️ Yes |
| `backend/src/db.ts` | Database schema + queries | ✏️ Yes |
| `frontend/src/App.tsx` | React routes + layout | ✏️ Yes |
| `frontend/src/lib/api.ts` | API client functions | ✏️ Yes |
| `backend/.env` | Database credentials | ❌ git ignored |
| `frontend/dist/` | Built frontend | ❌ Regenerate with `npm run build` |

## 🔧 Common Development Tasks

### Add New API Endpoint

1. Add route in `backend/src/index.ts`
2. Add function in `frontend/src/lib/api.ts`
3. Use in component with React Query
4. Document in `docs/API.md`

### Add New Page

1. Create component in `frontend/src/pages/`
2. Add route in `frontend/src/App.tsx`
3. Add link in `frontend/src/components/layout/Sidebar.tsx`

### Change Database Schema

1. Edit table creation in `backend/src/db.ts`
2. Restart backend (auto-applies on startup)
3. Update types in `frontend/src/lib/types.ts`
4. Update docs in `docs/DATABASE.md`

## 🚀 Deployment Options

**For Production:**

1. **Simple**: Deploy backend, serve frontend via Express
2. **Docker**: Use Dockerfile, deploy anywhere
3. **Heroku**: Push to Heroku, auto-deploys
4. **AWS**: EC2 + RDS + nginx
5. **Cloud**: Railway.app, Vercel, etc.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed steps.

## 📞 Key Contacts & Resources

### Documentation
- **Setup Issues**: [SETUP.md](./SETUP.md)
- **Dev Questions**: [DEVELOPMENT.md](./DEVELOPMENT.md)
- **API Details**: [API.md](./API.md)
- **Can't Fix Issue?**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

### Database
- **Host**: localhost (dev) or production database
- **Name**: wmsu_hr_connect
- **User**: postgres
- **Port**: 5432

### GitHub
- **Repo**: (add your repo URL)
- **Branch**: main (production)
- **Pull Request Policy**: (add your policy)

## 🔐 Security Checklist

**Before Production:**
- [ ] Change `JWT_SECRET` to something secure
- [ ] Use strong database password
- [ ] Enable HTTPS/SSL
- [ ] Set `NODE_ENV=production`
- [ ] Review all environment variables
- [ ] Set proper database permissions
- [ ] Configure firewall rules
- [ ] Set up database backups
- [ ] Enable audit logging review
- [ ] Test authentication thoroughly

## 📈 Performance Baseline

Current performance:
- **Frontend Build**: 13.94s
- **Frontend Bundle**: 1.1 MB (307 KB gzipped)
- **Backend Response**: <100ms typical
- **Database Query**: <100ms typical
- **Load Time**: ~2-3 seconds cold start

## ⚠️ Known Limitations & Future Improvements

### Current Limitations
- Backend runs on single server (no horizontal scaling)
- Files stored locally (not cloud storage)
- Background jobs run on main server
- No pagination implemented (full result sets returned)

### Recommended Future Improvements
1. Split `index.ts` into separate route files
2. Add Redis for caching
3. Implement distributed job queue (Bull)
4. Move file uploads to S3
5. Add database connection pooling
6. Implement pagination for large datasets
7. Add rate limiting to all endpoints
8. Set up CI/CD pipeline

## 🆕 Recent Changes (May 2026)

### Archive Duration Configuration System
- **Feature**: Admins can adjust vacancy archive retention (1-180 days)
- **Location**: Archive page, "Set Retention Period" button
- **Technical**: Settings stored in `application_settings` table
- **Impact**: Provides flexibility in data retention policy

### Improved Delete Confirmations
- **Feature**: All delete operations use themed shadcn/ui Dialog
- **Why**: Better UX and visual consistency
- **Files**: UserManagement, Evaluations, ApplicationTracking, JobVacancies

### Database Maintenance Scripts
- **archiveExpiredVacancies()**: Daily job that moves closed vacancies to archive
- **cleanupOldArchivedVacancies()**: Daily job that marks old archived records for deletion
- **Run**: Automatically on backend startup, repeats daily

## 📚 Recommended Reading Order

For a new team member:

**Day 1** (2-3 hours):
1. This handover guide
2. [README.md](../README.md)
3. [SHORTCUTS.md](./SHORTCUTS.md) - Create desktop shortcut for quick access
4. [SETUP.md](./SETUP.md) - Get it running
5. [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Where everything is

**Day 2-3** (4-6 hours):
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - How it works
2. [API.md](./API.md) - What endpoints exist
3. [DATABASE.md](./DATABASE.md) - What data structure

**Day 4-5** (ongoing):
1. [DEVELOPMENT.md](./DEVELOPMENT.md) - Coding standards
2. Start working on features
3. Reference other docs as needed

## ✅ Sign-Off Checklist

Before IT team takes over, ensure:

- [ ] Team can run dev environment locally
- [ ] Team can build for production
- [ ] Team understands authentication flow
- [ ] Team knows where to find documentation
- [ ] Team has database access
- [ ] Team has GitHub repo access
- [ ] Backup procedures documented
- [ ] Deployment procedures documented
- [ ] Monitoring set up
- [ ] Incidents response plan ready

## 🎓 Learning Resources

- **React**: https://react.dev
- **TypeScript**: https://www.typescriptlang.org
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Express**: https://expressjs.com
- **Tailwind CSS**: https://tailwindcss.com/docs
- **React Query**: https://tanstack.com/query

## 🆘 Emergency Contacts

If critical issue in production:
1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Check logs: `pm2 logs` or `journalctl`
3. Check database: `psql wmsu_hr_connect -c "SELECT 1"`
4. Restart backend: `pm2 restart wmsu-hr-backend`
5. Last resort: Rollback to previous commit

## 📋 Next Steps

1. **Complete Setup**: Follow [SETUP.md](./SETUP.md)
2. **Understand Project**: Read [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Know Your Tools**: Review [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
4. **Ready to Code**: Follow [DEVELOPMENT.md](./DEVELOPMENT.md)
5. **Deploy to Production**: Follow [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Handover Date**: May 7, 2026  
**Status**: ✅ Production Ready  
**Support**: Documentation in `/docs` folder  

**Welcome to the team!** 🎉

If you have questions, check the documentation first. If still stuck, contact the development team with:
- What you were trying to do
- The error message
- What you've tried
- Your environment details

Good luck! 🚀
