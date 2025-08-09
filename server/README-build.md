Build a standalone Windows executable (.exe) and one-click installer (bundles server + client)

Prereqs:
- Node.js 18+
- NSIS (for installer): https://nsis.sourceforge.io/Download (ensure `makensis` is in PATH)

Steps (PowerShell):

1) Install deps
```
cd server
npm install
```

2) Build client (Vite) and stage into server/public
```
npm run build:client
npm run stage:public
```

3) Build bundled JS and package into .exe
```
npm run pkg
```

Outputs:
- build/collab-server.exe

Run the executable:
```
# default port 4000
./build/collab-server.exe

# custom port
$env:PORT=4001; $env:SELF_URL='ws://<your-ip>:4001'; ./build/collab-server.exe
```

Create one-click installer:
```
npm run installer:nsis
```

Installer output:
- build/CollabNet-Setup-0.1.0.exe

What the installer does:
- Installs collab-server.exe to Program Files and copies client assets to `public/`.
- Creates Start Menu and Desktop shortcuts.
- Launches the app after install. The server auto-opens your default browser to your LAN-accessible URL.

Notes:
- pkg warning about dynamic require in Express is expected and harmless for this app (no view engine used).
- If you add native modules or dynamic requires later, adjust bundling accordingly.
