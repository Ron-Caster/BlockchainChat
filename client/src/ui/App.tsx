import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, NetworkBlock, BlockPayload, NoteDocument } from 'shared/types';

type BlockEnvelope = NetworkBlock<BlockPayload>;

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host.replace(/:\d+$/, ':4000'));

export const App: React.FC = () => {
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [input, setInput] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'hello', role: 'client' }));
    };
    ws.onclose = () => setStatus('disconnected');
    ws.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'chain') {
          const chain: BlockEnvelope[] = msg.chain;
          ingestChain(chain);
        }
        if (msg.type === 'block') {
          ingestBlock(msg.block);
        }
      } catch (e) {
        console.error('ws parse', e);
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    // auto-scroll chat to bottom on new messages
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function ingestChain(chain: BlockEnvelope[]) {
    const chats: ChatMessage[] = [];
    const noteMap: Map<string, NoteDocument> = new Map();
    chain.forEach(b => {
      if (b.data.kind === 'chat' && b.data.message) chats.push(b.data.message);
      if (b.data.kind === 'note' && b.data.note) {
        noteMap.set(b.data.note.id, b.data.note);
      }
    });
    setMessages(chats.sort((a,b)=>a.timestamp-b.timestamp));
    setNotes([...noteMap.values()].sort((a,b)=>b.updatedAt - a.updatedAt));
  }

  function ingestBlock(block: BlockEnvelope) {
    if (block.data.kind === 'chat' && block.data.message) {
      setMessages((m: ChatMessage[]) => [...m, block.data.message!]);
    }
    if (block.data.kind === 'note' && block.data.note) {
      setNotes((prev: NoteDocument[]) => {
        const map = new Map<string, NoteDocument>(prev.map((n: NoteDocument) => [n.id, n] as const));
        map.set(block.data.note!.id, block.data.note!);
        return [...map.values()].sort((a: NoteDocument, b: NoteDocument) => b.updatedAt - a.updatedAt);
      });
    }
  }

  function sendMessage() {
    if (!input.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: 'cmd', action: 'sendMessage', content: input, author: 'you' }));
    setInput('');
  }
  function addNote() {
    if (!noteTitle.trim() || !noteBody.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: 'cmd', action: 'addNote', title: noteTitle, body: noteBody }));
    setNoteTitle('');
    setNoteBody('');
  }

  const statusDot = useMemo(() => (
    <span className={`status-dot ${status}`} title={`WebSocket ${status}`} />
  ), [status]);

  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20Zm4.7 14.3a1 1 0 01-1.37.37c-2.3-1.33-5.2-1.63-8.62-.88a1 1 0 11-.42-1.96c3.9-.85 7.2-.5 9.85 1.03.47.27.63.87.36 1.44Zm.9-3.78a1.2 1.2 0 01-1.65.45c-2.65-1.57-6.68-2.03-9.8-1.1a1.2 1.2 0 01-.66-2.32c3.7-1.06 8.2-.54 11.36 1.3.57.34.75 1.05.45 1.66Zm.3-3.92a1.4 1.4 0 01-1.93.53c-3.06-1.8-8.1-1.98-11.03-1.1a1.4 1.4 0 01-.78-2.7c3.56-1.03 9.3-.8 12.98 1.34.67.4.9 1.25.53 1.93Z" fill="currentColor"/>
          </svg>
          <span>CollabNet</span>
        </div>
        <nav className="nav">
          <a className="nav-item active"><span>Home</span></a>
          <a className="nav-item"><span>Chat</span></a>
          <a className="nav-item"><span>Notes</span></a>
        </nav>
        <div className="sidebar-footer">
          <div className="connection">{statusDot}<span>{status}</span></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="search">
            <input placeholder="Search notes or messages..."/>
          </div>
          <div className="topbar-right">
            <button className="pill" onClick={() => window.open('/health', '_blank')}>Server Health</button>
          </div>
        </header>

        <section className="content-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Chat</h2>
            </div>
            <div className="chat-window" ref={chatScrollRef}>
              {messages.map(m => (
                <div key={m.id} className={`chat-row ${m.author === 'you' ? 'self' : ''}`}>
                  <div className="avatar" aria-hidden>{m.author.charAt(0).toUpperCase()}</div>
                  <div className="bubble">
                    <div className="meta">
                      <strong>{m.author}</strong>
                      <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text">{m.content}</div>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="empty">No messages yet. Say hi!</div>
              )}
            </div>
            <div className="chat-input">
              <input
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if (e.key==='Enter') sendMessage(); }}
                placeholder="Type a message"
              />
              <button className="primary" onClick={sendMessage}>Send</button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Notes</h2>
            </div>
            <div className="note-composer">
              <input
                value={noteTitle}
                onChange={e=>setNoteTitle(e.target.value)}
                placeholder="Note title"
              />
              <textarea
                value={noteBody}
                onChange={e=>setNoteBody(e.target.value)}
                placeholder="Write your note..."
                rows={4}
              />
              <div className="composer-actions">
                <button onClick={() => { setNoteTitle(''); setNoteBody(''); }} className="pill">Clear</button>
                <button onClick={addNote} className="primary">Add Note</button>
              </div>
            </div>

            <div className="note-list">
              {notes.map(n => (
                <article key={n.id} className="note-card">
                  <header>
                    <h3 title={n.title}>{n.title}</h3>
                    <time>{new Date(n.updatedAt).toLocaleTimeString()}</time>
                  </header>
                  <p className="body">{n.body}</p>
                </article>
              ))}
              {notes.length === 0 && (
                <div className="empty">No notes yet. Add your first note above.</div>
              )}
            </div>
          </div>
        </section>

        <details className="debug">
          <summary>Debug</summary>
          <pre>{JSON.stringify({ messages, notes }, null, 2)}</pre>
        </details>
      </main>
    </div>
  );
};
