# Desktop Shortcut Setup Guide

Quick guide to create desktop shortcuts for running WMSU HRMO Tracker locally or accessing the production site.

## � Automated Setup (Easiest Method - RECOMMENDED)

### One-Click Shortcut Creation

The project includes **automated PowerShell scripts** that do everything for you!

**In the project root folder, double-click:**
```
Create Desktop Shortcut.cmd
```

That's it! Done! A "WMSU HRMO" shortcut appears on your desktop.

**What happens:**
- ✅ Creates desktop shortcut "WMSU HRMO.lnk"
- ✅ Extracts WMSU seal from `/frontend/public/wmsu-seal.png`
- ✅ Converts to custom icon (`wmsu-logo.ico`)
- ✅ Points to `start-web-app.cmd` launcher
- ✅ Removes old shortcuts automatically

### How the Automation Works

**Two files power this:**

1. **`Create Desktop Shortcut.cmd`** - Batch file you double-click
   - Calls the PowerShell script
   - Handles Windows permissions

2. **`create-desktop-shortcut.ps1`** - PowerShell script that:
   - Reads the WMSU seal PNG image
   - Crops transparent areas
   - Resizes to 256x256 pixels
   - Creates .ico icon file
   - Creates Windows shortcut
   - Places on desktop with custom icon

### After Creating the Shortcut

1. **Desktop has**: "WMSU HRMO" shortcut with WMSU logo
2. **Double-click it** to launch the app
3. **It will**:
   - Run `start-web-app.cmd`
   - Start the development server
   - Open http://localhost:5173 in browser
   - App is ready to use!

### Troubleshooting: Script Won't Run

If double-clicking `Create Desktop Shortcut.cmd` doesn't work:

**Fix 1: Unblock the file**
1. Right-click `Create Desktop Shortcut.cmd`
2. Click "Properties"
3. Check "Unblock" (if visible)
4. Click "Apply" → "OK"
5. Try again

**Fix 2: Run manually with PowerShell**
1. Right-click PowerShell → Run as Administrator
2. Navigate to project:
```powershell
cd "C:\Users\YourName\Desktop\Github-repo's\wmsu-hrmo-tracker"
```
3. Run:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "create-desktop-shortcut.ps1"
```

**Fix 3: Windows Defender blocked it**
- Wait 1-2 minutes for Windows Defender to finish scanning
- Try again

---

## 📌 Manual Setup (If Automated Scripts Don't Work)

### Option 1: Simple Start Shortcut

**For starting the dev server manually without the custom icon.**

1. Open Notepad
2. Paste this:
```batch
@echo off
cd /d "C:\Users\YourName\Desktop\Github-repo's\wmsu-hrmo-tracker"
npm run dev
pause
```
3. Replace `YourName` with your Windows username
4. Save as `start-dev.bat` in project root
5. Right-click → "Send to" → "Desktop (create shortcut)"
6. Done! Double-click shortcut to start server

---

### Option 3: Production Site Shortcut

**For accessing the live production site.**

1. Right-click desktop → New → Shortcut
2. Enter: `https://your-production-url.com`
3. Name it: "HR Connect (Production)"
4. Click Finish

---

## 🐧 macOS Setup

### For macOS Users

#### Step 1: Create Shell Script

1. Open Terminal
2. Navigate to project:
```bash
cd ~/Desktop/Github-repo\'s/wmsu-hrmo-tracker
```

3. Create `start-dev.sh`:
```bash
nano start-dev.sh
```

4. Paste this:
```bash
#!/bin/bash
cd "$(dirname "$0")"
npm run dev
```

5. Save (Ctrl+X, Y, Enter)
6. Make executable:
```bash
chmod +x start-dev.sh
```

#### Step 2: Create macOS Shortcut

1. Open Automator → New → Application
2. Add "Run Shell Script" action
3. Paste:
```bash
/path/to/start-dev.sh
```
4. Save as "HR Connect Dev" in Applications
5. Right-click → Add to Dock

---

## 🐧 Linux Setup

### For Linux Users

#### Create Desktop File

1. Create `~/.local/share/applications/hr-connect.desktop`:

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=HR Connect Dev
Comment=Start WMSU HRMO Tracker development server
Exec=/home/username/Desktop/Github-repo\'s/wmsu-hrmo-tracker/start-dev.sh
Icon=code
Terminal=true
Categories=Development;
```

2. Make executable:
```bash
chmod +x ~/.local/share/applications/hr-connect.desktop
```

3. Now appears in application menu

---

## 🎯 Quick Reference

| What | How | Result |
|------|-----|--------|
| **Create Shortcut** | Double-click `Create Desktop Shortcut.cmd` | Desktop shortcut appears |
| **Launch App** | Double-click "WMSU HRMO" shortcut | Dev server starts, browser opens |
| **Stop Server** | Ctrl+C in terminal | Server stops |
| **View App** | Browser: `http://localhost:5173` | HR Connect running |
| **View API** | Browser: `http://localhost:4000` | Backend running |

---

## 🆘 Troubleshooting

### Automated Script Issues

**Script blocked by Windows Defender:**
- Wait 1-2 minutes for scan to complete
- Right-click file → Properties → "Unblock"
- Try again

**"Access Denied" error:**
1. Right-click `Create Desktop Shortcut.cmd`
2. Properties → Uncheck "Read-only"
3. Click "Apply" → "OK"
4. Try again

**PowerShell execution policy error:**
Run PowerShell as Administrator:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try the script again.

**Icon not showing on shortcut:**
- The script may have had issues reading the PNG
- Verify `/frontend/public/wmsu-seal.png` exists
- Delete `wmsu-logo.ico` if it exists
- Run `Create Desktop Shortcut.cmd` again

### General Issues

**Shortcut won't start server:**
- Check path in batch file matches your actual folder
- Try running batch file directly first
- Ensure `npm` works: `npm --version` in terminal

**Port 5173 already in use:**
Change port in `frontend/vite.config.ts`:
```typescript
export default defineConfig({
  server: {
    port: 3000  // Changed from 5173
  }
})
```
Then access at `http://localhost:3000`

Or kill process using port:
```powershell
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

**npm command not found:**
1. Install Node.js: https://nodejs.org
2. Restart terminal
3. Verify: `npm --version`

**Browser won't open:**
- Dev server might need more time
- Wait 15-20 seconds after terminal shows "ready"
- Open manually: `http://localhost:5173`

---

## 📝 Sharing with Team

To share shortcut creation with team:

**Method 1: Share Automation Scripts (Recommended)**
- Give team the whole project (they get both scripts)
- They run `Create Desktop Shortcut.cmd`
- Everyone gets the same branded shortcut

**Method 2: Share Manual Instructions**
- Send team [SHORTCUTS.md](./SHORTCUTS.md)
- They follow manual setup section
- Takes 5 minutes per person

---

## 💡 Pro Tips for Shortcuts

1. **Pin to Taskbar**: Right-click running app → "Pin to taskbar"
2. **Pin to Start Menu**: Right-click shortcut → "Pin to Start"  
3. **Keyboard Shortcut**: Right-click shortcut → Properties → Shortcut key (e.g., Ctrl+Alt+H)
4. **Run as Admin**: Properties → Advanced → Check "Run as administrator"
5. **Minimize on Launch**: Properties → Run → Select "Minimized"
6. **Quick Launch**: Move shortcut to Windows Quick Launch folder for instant access

---

## ✅ Team Handover Checklist

Ensure HR staff and the Head HR (Admin) know about shortcuts:

- [ ] Team received project with `Create Desktop Shortcut.cmd`
- [ ] Team successfully created desktop shortcut
- [ ] Team can double-click shortcut and launch app
- [ ] Team knows to delete old "WMSU HRMO Tracker" shortcut if exists
- [ ] Team has this documentation saved locally
- [ ] Team knows manual shortcut creation as backup

---

**Last Updated**: May 6, 2026  
**Platform Support**: Windows ✅ | macOS ✅ | Linux ✅  
**Status**: ✅ Production Ready

Need more help? See [SETUP.md](./SETUP.md) or [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
