Build a standalone Windows executable (.exe) for the server

Prereqs:
- Node.js 18+

Steps (PowerShell):

1) Install deps
```
cd server
npm install
```

2) Build bundled JS and package into .exe
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

Notes:
- The binary bundles your server and node runtime via pkg. Static assets are not needed; the app is API + WebSocket only.
- If you add dynamic requires or native modules, adjust the bundling step accordingly.
