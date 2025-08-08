import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage, NetworkBlock, BlockPayload, NoteDocument } from 'shared/types';

type BlockEnvelope = NetworkBlock<BlockPayload>;

interface NoteIndexEntry { id: string; title: string; updatedAt: number; }

const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host.replace(/:\d+$/, ':4000'));

export const App: React.FC = () => {
  const [status, setStatus] = useState('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<NoteDocument[]>([]);
  const [input, setInput] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

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
      setMessages(m => [...m, block.data.message!]);
    }
    if (block.data.kind === 'note' && block.data.note) {
      setNotes(prev => {
        const map = new Map(prev.map(n=>[n.id,n] as const));
        map.set(block.data.note!.id, block.data.note!);
        return [...map.values()].sort((a,b)=>b.updatedAt - a.updatedAt);
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

  return (
    <div style={{ fontFamily: 'system-ui', padding: '1rem', maxWidth: 900, margin: '0 auto' }}>
      <h1>Collaborative Notepad / Chat</h1>
      <p>Status: <strong style={{ color: status==='connected' ? 'green':'red' }}>{status}</strong></p>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          <h2>Chat</h2>
          <div style={{ border: '1px solid #ccc', padding: '.5rem', height: 300, overflow: 'auto', background:'#fafafa' }}>
            {messages.map(m => <div key={m.id}><small>{new Date(m.timestamp).toLocaleTimeString()} </small><strong>{m.author}:</strong> {m.content}</div>)}
          </div>
          <div style={{ marginTop: '.5rem' }}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') sendMessage(); }} placeholder="Type a message" style={{ width:'70%' }} />
            <button onClick={sendMessage} style={{ marginLeft: '.5rem' }}>Send</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <h2>Notes</h2>
          <div>
            <input value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="Note title" style={{ width:'100%', marginBottom: '.25rem' }} />
            <textarea value={noteBody} onChange={e=>setNoteBody(e.target.value)} placeholder="Note body" style={{ width:'100%', minHeight: 80 }} />
            <button onClick={addNote} style={{ marginTop: '.25rem' }}>Add Note</button>
          </div>
          <div style={{ border: '1px solid #ccc', padding: '.5rem', height: 300, overflow: 'auto', background:'#fcfcff', marginTop: '.5rem' }}>
            {notes.map(n => <div key={n.id} style={{ marginBottom: '.75rem' }}>
              <strong>{n.title}</strong>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '.9rem' }}>{n.body}</div>
              <small>Updated: {new Date(n.updatedAt).toLocaleTimeString()}</small>
            </div>)}
          </div>
        </div>
      </div>
      <hr />
      <details>
        <summary>Debug</summary>
        <pre style={{ fontSize: '.7rem', maxHeight: 200, overflow: 'auto' }}>{JSON.stringify({ messages, notes }, null, 2)}</pre>
      </details>
    </div>
  );
};
