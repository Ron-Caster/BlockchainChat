import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import os from 'os';
import type { ChatMessage, NoteDocument, NetworkBlock, BlockPayload } from '../../shared/types';
// axios was initially considered for future HTTP peer discovery; removed for now to keep deps minimal.

/*
 Distributed lightweight blockchain-ish replication:
 - Each server maintains a simple chain array of blocks.
 - New data => create block referencing prevHash, broadcast to peers.
 - Peers validate (basic checks) and append if extends current head. If fork & longer chain appears, replace.
 - Peers auto-discover via a bootstrap list (optionally passed in env) and periodic gossip of peer list.
 - WebSocket used for signaling + data.
 - This is intentionally simplified (no PoW, no signatures) for collaborative demo.
*/

interface PeerInfo { url: string; lastSeen: number; }

const PORT = parseInt(process.env.PORT || '4000', 10);
const SELF_URL = process.env.SELF_URL || `ws://localhost:${PORT}`;
const BOOTSTRAP = (process.env.BOOTSTRAP || '').split(',').filter(Boolean); // comma separated ws urls

const app = express();
app.use(cors());
app.use(express.json());

// In-memory state
let chain: NetworkBlock<BlockPayload>[] = [];
const peers: Map<string, PeerInfo> = new Map();
const clientSockets: Set<WebSocket> = new Set(); // frontend clients
const peerSockets: Map<WebSocket, string> = new Map();

function hash(data: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function createGenesis() {
  if (chain.length === 0) {
    const genesis: NetworkBlock<BlockPayload> = {
      index: 0,
      prevHash: '0',
      timestamp: Date.now(),
      data: { kind: 'note', note: { id: 'genesis', title: 'Welcome', body: 'Genesis Block', updatedAt: Date.now() } },
      hash: ''
    };
    genesis.hash = hash({ ...genesis, hash: undefined });
    chain.push(genesis);
  }
}

createGenesis();

function buildBlock(data: BlockPayload): NetworkBlock<BlockPayload> {
  const prev = chain[chain.length - 1];
  const block: NetworkBlock<BlockPayload> = {
    index: prev.index + 1,
    prevHash: prev.hash,
    timestamp: Date.now(),
    data,
    hash: ''
  };
  block.hash = hash({ ...block, hash: undefined });
  return block;
}

function isValidNewBlock(block: NetworkBlock<BlockPayload>, prev: NetworkBlock<BlockPayload>): boolean {
  if (block.index !== prev.index + 1) return false;
  if (block.prevHash !== prev.hash) return false;
  const validateHash = hash({ ...block, hash: undefined });
  if (validateHash !== block.hash) return false;
  return true;
}

function replaceChain(newChain: NetworkBlock<BlockPayload>[]) {
  if (newChain.length > chain.length && newChain[0].hash === chain[0].hash) {
    chain = newChain;
    broadcastState();
  }
}

function broadcast(msg: any, filter?: (ws: WebSocket) => boolean) {
  [...clientSockets, ...peerSockets.keys()].forEach(ws => {
    if (ws.readyState === ws.OPEN && (!filter || filter(ws))) {
      ws.send(JSON.stringify(msg));
    }
  });
}

function broadcastState() {
  broadcast({ type: 'chain', chain });
}

function broadcastPeers() {
  const list = [...peers.values()].map(p => p.url);
  broadcast({ type: 'peers', peers: list }, ws => peerSockets.has(ws));
}

// HTTP endpoints for health and current chain
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({ ok: true, height: chain.length, head: chain[chain.length - 1]?.hash });
});

app.get('/chain', (_req: express.Request, res: express.Response) => {
  res.json(chain);
});

app.post('/message', (req: express.Request, res: express.Response) => {
  const { author = 'anon', content } = req.body || {};
  if (!content) return res.status(400).json({ error: 'content required' });
  const message: ChatMessage = { id: crypto.randomUUID(), author, content, timestamp: Date.now(), type: 'message' };
  const block = buildBlock({ kind: 'chat', message });
  chain.push(block);
  broadcast({ type: 'block', block });
  res.json({ ok: true, block });
});

app.post('/note', (req: express.Request, res: express.Response) => {
  const { id, title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'title & body required' });
  const note: NoteDocument = { id: id || crypto.randomUUID(), title, body, updatedAt: Date.now() };
  const block = buildBlock({ kind: 'note', note });
  chain.push(block);
  broadcast({ type: 'block', block });
  res.json({ ok: true, block });
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // Print LAN-accessible URLs so others on same WiFi can connect.
  const nets = os.networkInterfaces();
  const lanUrls: string[] = [];
  Object.values(nets).forEach(ifaces => {
    ifaces?.forEach(iface => {
      if (!iface.internal && iface.family === 'IPv4') {
        lanUrls.push(`http://${iface.address}:4000`, `ws://${iface.address}:4000`);
      }
    });
  });
  if (lanUrls.length) {
    console.log('LAN endpoints:');
    lanUrls.forEach(u => console.log('  ', u));
    console.log('Share the http://<ip>:4000/health or WebSocket ws://<ip>:4000 with peers / clients.');
  }
});

// WebSocket server (single) for both clients & peers. Identify role after connect.
const wss = new WebSocketServer({ server });

interface WSAuthHello { type: 'hello'; role: 'client' | 'peer'; url?: string; }

enum PeerMsgType {
  HELLO = 'hello',
  REQUEST_CHAIN = 'request_chain'
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'hello') {
        const role = msg.role as 'client' | 'peer';
        if (role === 'client') {
          clientSockets.add(ws);
          ws.send(JSON.stringify({ type: 'chain', chain }));
        } else if (role === 'peer') {
          const url = msg.url as string || '';
            peerSockets.set(ws, url);
            peers.set(url, { url, lastSeen: Date.now() });
            ws.send(JSON.stringify({ type: 'chain', chain }));
            broadcastPeers();
        }
        return;
      }
      if (msg.type === 'block') {
        const block: NetworkBlock<BlockPayload> = msg.block;
        const prev = chain[chain.length - 1];
        if (isValidNewBlock(block, prev)) {
          chain.push(block);
          broadcast({ type: 'block', block });
        } else {
          // request full chain if mismatch
          ws.send(JSON.stringify({ type: 'request_chain' }));
        }
        return;
      }
      if (msg.type === 'chain') {
        const incoming: NetworkBlock<BlockPayload>[] = msg.chain;
        if (incoming && Array.isArray(incoming)) {
          if (incoming.length > chain.length && incoming[0].hash === chain[0].hash) {
            // basic validity pass
            let ok = true;
            for (let i=1;i<incoming.length;i++) if (!isValidNewBlock(incoming[i], incoming[i-1])) { ok=false; break; }
            if (ok) replaceChain(incoming);
          }
        }
        return;
      }
      if (msg.type === 'request_chain') {
        ws.send(JSON.stringify({ type: 'chain', chain }));
        return;
      }
    } catch (e) {
      console.error('ws msg parse error', e);
    }
  });
  ws.on('close', () => {
    clientSockets.delete(ws);
    const url = peerSockets.get(ws);
    if (url) peerSockets.delete(ws);
  });
});

function connectPeer(url: string) {
  if (url === SELF_URL) return;
  if ([...peerSockets.values()].includes(url)) return;
  try {
    const pws = new WebSocket(url);
    pws.on('open', () => {
      pws.send(JSON.stringify({ type: 'hello', role: 'peer', url: SELF_URL }));
      pws.send(JSON.stringify({ type: 'request_chain' }));
      peers.set(url, { url, lastSeen: Date.now() });
    });
    pws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'block') {
          const block: NetworkBlock<BlockPayload> = msg.block;
          const prev = chain[chain.length - 1];
          if (isValidNewBlock(block, prev)) {
            chain.push(block);
            broadcast({ type: 'block', block });
          } else {
            pws.send(JSON.stringify({ type: 'request_chain' }));
          }
        } else if (msg.type === 'chain') {
          const incoming: NetworkBlock<BlockPayload>[] = msg.chain;
          if (incoming.length > chain.length && incoming[0].hash === chain[0].hash) {
            let ok = true;
            for (let i=1;i<incoming.length;i++) if (!isValidNewBlock(incoming[i], incoming[i-1])) { ok=false; break; }
            if (ok) replaceChain(incoming);
          }
        } else if (msg.type === 'peers') {
          const list: string[] = msg.peers || [];
            list.forEach(u => { if (!peers.has(u)) connectPeer(u); });
        } else if (msg.type === 'request_chain') {
          pws.send(JSON.stringify({ type: 'chain', chain }));
        }
      } catch (e) {
        console.error('peer msg parse', e);
      }
    });
    pws.on('close', () => {
      peerSockets.delete(pws as unknown as WebSocket);
    });
    // store mapping
    (peerSockets as any).set(pws, url);
  } catch (e) {
    console.error('connectPeer error', e);
  }
}

// Periodic gossip
setInterval(() => {
  broadcastPeers();
  // attempt reconnects to known peers not connected
  peers.forEach(p => {
    const connected = [...peerSockets.values()].includes(p.url);
    if (!connected) connectPeer(p.url);
  });
}, 5000);

// Bootstrap peers
BOOTSTRAP.forEach(u => connectPeer(u));

// Allow posting via websockets from clients for low-latency
function handleClientCommand(cmd: any) {
  if (cmd.action === 'sendMessage') {
    const message: ChatMessage = { id: crypto.randomUUID(), author: cmd.author || 'anon', content: cmd.content, timestamp: Date.now(), type: 'message' };
    const block = buildBlock({ kind: 'chat', message });
    chain.push(block);
    broadcast({ type: 'block', block });
  }
  if (cmd.action === 'addNote') {
    const note: NoteDocument = { id: crypto.randomUUID(), title: cmd.title || 'Untitled', body: cmd.body || '', updatedAt: Date.now() };
    const block = buildBlock({ kind: 'note', note });
    chain.push(block);
    broadcast({ type: 'block', block });
  }
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'cmd') handleClientCommand(msg);
    } catch {}
  });
});
