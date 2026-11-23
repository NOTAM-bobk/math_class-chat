export interface Group {
  id: string;
  name: string;
  topic: string | null;
  locked: boolean;
  isHome: boolean;
  createdAt: number;
  messageCount: number;
  lastAt: number | null;
}

export interface Message {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  pending?: boolean;
}

export interface Identity {
  id: string;
  name: string;
}
