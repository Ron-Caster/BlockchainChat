export interface ChatMessage {
  id: string;
  author: string;
  content: string;
  timestamp: number; // ms epoch
  type: 'message' | 'note';
}

export interface NoteDocument {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface NetworkBlock<T = any> {
  index: number;
  prevHash: string;
  timestamp: number;
  data: T;
  hash: string;
  signature?: string; // optional for future auth
}

export interface BlockPayload {
  kind: 'chat' | 'note';
  message?: ChatMessage;
  note?: NoteDocument;
}

export interface SyncState {
  head: string; // hash of best chain head
  height: number;
}
