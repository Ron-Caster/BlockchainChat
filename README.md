# Collaborative Notepad / Chat (Demo)

A minimal full-stack real-time collaborative demo using:

- Frontend: Vite + React + TypeScript
- Backend: Node.js (Express + WebSocket)
- Simple blockchain-like replication so multiple backend nodes can form a peer-to-peer network and sync state (notes + chat messages) without a single central authority.

## Features
- Add chat messages or notes from the UI.
- All connected browser clients instantly receive new data through WebSockets.
- Backend servers broadcast new data as *blocks* referencing previous hash; peers reconcile longest valid chain.
- Peer auto-discovery + periodic gossip of peer list.

> Security / auth / consensus are intentionally **simplified**. This is an educational example (no PoW, no signatures, no fork resolution sophistication). Not production ready.

## Project Structure
```
/shared         Shared TypeScript interfaces (imported by both server & client)
/server         Node.js server (Express + ws)
/client         Vite React app
```

## Getting Started

Open two terminals (or more) to simulate multiple servers (Windows PowerShell examples).

### Install dependencies
```
cd server
npm install
cd ../client
npm install
```

### Run one server
```
cd server
npm run dev
```
This starts on port 4000 by default. The server will print LAN endpoints (e.g. `http://192.168.1.23:4000`) so others on your WiFi can point their browsers / peer servers there.

### (Optional) Run a second peer server
In a new terminal:
```
set PORT=4001; set SELF_URL=ws://localhost:4001; set BOOTSTRAP=ws://localhost:4000; npm run dev
```
> For PowerShell you can: `$env:PORT=4001; $env:SELF_URL='ws://localhost:4001'; $env:BOOTSTRAP='ws://localhost:4000'; npm run dev`

The second server will connect to the first and sync the chain. Adding messages/notes via any server or via a client connected to either propagates to all.

### Run the frontend
```
cd client
npm run dev
```
Visit: http://localhost:5173 (default Vite port). To allow others on same WiFi to use the UI you host, have them visit `http://<your-lan-ip>:5173`. (Vite is configured with `host: 0.0.0.0`.) The UI assumes server on port 4000 at that same host; if they connect to your LAN IP the WS URL will resolve automatically. Adjust `WS_URL` in `client/src/ui/App.tsx` for custom setups.

### Using the App
- Chat: Type a message & Enter or click Send.
- Notes: Enter title & body, click Add Note.
- Watch them appear in real time across multiple browser tabs and servers.

## How the Mini-Blockchain Works
- Each server has an in-memory `chain` array.
- New user action => create block `{index, prevHash, data, hash}`.
- Broadcast block to peers + local clients over WebSocket.
- Peers validate basic linkage & hash; if mismatch, request full chain.
- On receiving a longer valid chain with matching genesis, replace local chain.

## Extending Ideas
- Add digital signatures per block.
- Replace longest-chain with CRDT for notes (rich text) while keeping block log for messages.
- Persist chain to disk or database.
- Add authentication + user identities.
- Better fork resolution / conflict handling.

## Disclaimer
Educational example only. No warranty.
