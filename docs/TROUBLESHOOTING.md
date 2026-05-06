# Troubleshooting Guide

Common issues and solutions.

## Development Issues

### "Port 4000 already in use"

**Symptom**: `Error: listen EADDRINUSE: address already in use :::4000`

**Solution:**

```bash
# macOS/Linux - Find and kill process
lsof -i :4000
kill -9 <PID>

# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process

# Or change port in backend/.env
PORT=5000
```

### "Cannot connect to database"

**Symptom**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**

```bash
# Check if PostgreSQL is running
sudo service postgresql status      # Linux
brew services list | grep postgres  # macOS
Get-Service PostgreSQL*             # Windows

# If not running, start it
sudo service postgresql start       # Linux
brew services start postgresql      # macOS

# Test connection directly
psql -U postgres -d wmsu_hr_connect

# Verify DATABASE_URL is correct
# Format: postgres://username:password@localhost:5432/database
```

### "Module not found" errors

**Symptom**: `Cannot find module '@/components/ui/button'`

**Solution:**

```bash
# Reinstall all dependencies
rm -rf node_modules package-lock.json
npm install

# Clear npm cache
npm cache clean --force
npm install

# For frontend only issues
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Frontend shows CORS error

**Symptom**: `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**

1. Check `VITE_API_URL` in `frontend/.env.local`:
```env
VITE_API_URL=http://localhost:4000/api
```

2. Verify backend is running:
```bash
curl http://localhost:4000/api/jobs
```

3. Check CORS headers in backend `index.ts` are correct

4. Clear browser cache: `Ctrl+Shift+Delete` → Clear All

### "Hot reload not working"

**Symptom**: Changes don't appear after saving file

**Solution:**

```bash
# Restart dev server
npm run dev

# Or if just frontend
cd frontend
npm run dev

# Check if file was actually saved
# Look for "rebuilt" in terminal output

# If still broken, try:
rm -rf frontend/node_modules/.vite
npm run dev
```

## Database Issues

### "Table already exists" error

**Symptom**: `Error: relation "users" already exists`

**Solution:**

This is a warning during development. Safe to ignore. The `CREATE TABLE IF NOT EXISTS` handles it.

### "Database doesn't exist"

**Symptom**: `database "wmsu_hr_connect" does not exist`

**Solution:**

```bash
# Create the database
createdb wmsu_hr_connect

# Or using psql
psql -U postgres
CREATE DATABASE wmsu_hr_connect;
\c wmsu_hr_connect
```

### "Column doesn't exist" error

**Symptom**: `column "some_column" does not exist`

**Solution:**

1. This usually means database schema is out of sync
2. Restart backend - it will auto-add missing columns:
```bash
npm run dev
# Look for "✓ Database schema updated"
```

3. Or manually in psql:
```bash
psql wmsu_hr_connect

# Check existing columns
\d table_name

# Add missing column
ALTER TABLE table_name ADD COLUMN new_column TEXT;
```

## Login Issues

### "Invalid credentials" but correct password

**Symptom**: Can't login even with correct email/password

**Solution:**

1. Verify test account was created:
```bash
psql wmsu_hr_connect

SELECT id, name, email, role FROM users LIMIT 5;
```

2. If no users, seed the database:
```bash
# Backend should have seeding built in on first run
# Or manually create:
INSERT INTO users (id, name, email, role, password_hash, is_active, created_at)
VALUES ('admin-id', 'Admin', 'admin@wmsu.edu', 'admin', 
  '$2a$10$...hashed_password...', true, NOW());
```

3. Test login endpoint directly:
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wmsu.edu","password":"password123"}'
```

### Token expired error

**Symptom**: Suddenly logged out or "Unauthorized" error

**Solution:**

This is normal - token expires after 7 days (configured in `.env`). User must login again.

To change expiration:
```env
TOKEN_EXPIRES_IN=30d
```

## Backend Build Issues

### "TypeScript compilation error"

**Symptom**: `error TS2551: Property 'X' does not exist`

**Solution:**

```bash
# Type errors shown during build
npm run build

# Fix errors in the file, then rebuild
npm run build

# If many errors, check types.ts matches database
cat backend/src/db.ts | grep "CREATE TABLE"
```

### "Module resolution error"

**Symptom**: `Cannot find module '../db'`

**Solution:**

```bash
# Check file exists and path is correct
ls backend/src/db.ts

# In index.ts, import should be:
import { query, initDb } from "./db.js";  // .js extension!

# Note the .js extension - TypeScript files compiled to JS
```

## Frontend Build Issues

### "Out of memory during build"

**Symptom**: `JavaScript heap out of memory`

**Solution:**

```bash
# Increase Node memory
NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Or clean and rebuild
rm -rf frontend/dist
rm -rf node_modules/.vite
npm run build
```

### "Vite build fails silently"

**Symptom**: Build command hangs or no output

**Solution:**

```bash
# Check for syntax errors
cd frontend
npm run build -- --debug

# Look for the error message
# Usually in the warning section before the failure
```

## Production Issues

### "500 Internal Server Error"

**Symptom**: `/api/*` endpoints return 500 error

**Solution:**

1. Check backend logs:
```bash
pm2 logs wmsu-hr-backend
journalctl -u service-name -f
```

2. Verify database is running and accessible:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

3. Check environment variables are set:
```bash
echo $DATABASE_URL
echo $JWT_SECRET
```

4. Restart backend:
```bash
pm2 restart wmsu-hr-backend
```

### "Static files not loading" (404 errors for CSS/JS)

**Symptom**: Page loads but CSS/JS files are 404

**Solution:**

1. Verify frontend was built:
```bash
ls frontend/dist/
# Should contain: index.html, assets/
```

2. Check nginx/server is serving static files:
```nginx
root /path/to/frontend/dist;
location / {
  try_files $uri $uri/ /index.html;
}
```

3. Check file permissions:
```bash
chmod -R 755 frontend/dist/
```

### "Database connection timeout in production"

**Symptom**: Takes very long or fails to connect

**Solution:**

1. Verify DATABASE_URL is correct:
```bash
echo $DATABASE_URL
# Should include host, port, credentials
```

2. Check firewall allows PostgreSQL port:
```bash
sudo ufw allow 5432/tcp  # Linux
```

3. Test connection with timeout:
```bash
psql "$DATABASE_URL" -c "SELECT 1" --connect-timeout=5
```

4. Increase timeout in backend if needed:
```typescript
// In db.ts connection pool
connectionTimeoutMillis: 10000  // 10 seconds
```

## Data Issues

### "Can't restore archived vacancy"

**Symptom**: Restore button shows error

**Solution:**

1. Check archived vacancy exists:
```bash
psql wmsu_hr_connect
SELECT * FROM archived_vacancies WHERE id = 'id-here';
```

2. Check original job still exists:
```bash
SELECT * FROM job_vacancies WHERE id = 'original-id';
```

3. If original is deleted, you can't restore - create new vacancy instead

## Performance Issues

### "Application is very slow"

**Symptom**: Pages take >5 seconds to load

**Solution:**

1. Check server resources:
```bash
top          # CPU and memory usage
free -h      # Free RAM
df -h        # Disk space
```

2. Check database performance:
```bash
psql wmsu_hr_connect
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

3. Check network latency:
```bash
ping <database-host>
# Should be <100ms
```

4. Enable query logging to find slow queries:
```sql
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries >1s
SELECT pg_reload_conf();
```

5. Consider adding database indexes:
```sql
CREATE INDEX idx_applications_vacancy_id ON applications(vacancy_id);
CREATE INDEX idx_applications_status ON applications(status);
```

## Getting Help

If issue not listed:

1. **Check logs first**:
   - Backend: `pm2 logs`
   - Frontend: Browser DevTools Console (F12)
   - Database: `/var/log/postgresql/`

2. **Search error message** on Google/Stack Overflow

3. **Check documentation**:
   - [SETUP.md](./SETUP.md) - Setup issues
   - [DEVELOPMENT.md](./DEVELOPMENT.md) - Development workflow
   - [API.md](./API.md) - API errors

4. **Enable debug mode**:
```bash
DEBUG=* npm run dev
```

---

**Still stuck?** Document the error and contact the development team with:
- Full error message
- Steps to reproduce
- What you tried already
- Logs output
