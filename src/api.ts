import { loadIdentity } from "./identity";
import type { Group, Message } from "./types";

const TOKENS_KEY = "mathclass_chat_tokens";
const OWNERS_KEY = "mathclass_chat_owners";

function readMap(key: string): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: Record<string, string> = {};
    for (const [id, token] of Object.entries(parsed)) {
      if (typeof token === "string" && token.length > 0) clean[id] = token;
    }
    return clean;
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage failures */
  }
}

export const unlockTokens = {
  get: (groupId: string) => readMap(TOKENS_KEY)[groupId],
  set: (groupId: string, token: string) => writeMap(TOKENS_KEY, { ...readMap(TOKENS_KEY), [groupId]: token }),
  remove: (groupId: string) => {
    const next = readMap(TOKENS_KEY);
    delete next[groupId];
    writeMap(TOKENS_KEY, next);
  },
};

export const ownerTokens = {
  get: (groupId: string) => readMap(OWNERS_KEY)[groupId],
  set: (groupId: string, token: string) => writeMap(OWNERS_KEY, { ...readMap(OWNERS_KEY), [groupId]: token }),
  remove: (groupId: string) => {
    const next = readMap(OWNERS_KEY);
    delete next[groupId];
    writeMap(OWNERS_KEY, next);
  },
};

export class LockedError extends Error {
  group: Group | null;
  constructor(message: string, group: Group | null) {
    super(message);
    this.name = "LockedError";
    this.group = group;
  }
}

interface ErrorPayload {
  error?: string;
  locked?: boolean;
  group?: Group;
}

async function request<T>(path: string, init: RequestInit = {}, groupId?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  headers.set("x-user-id", loadIdentity().id);
  if (groupId) {
    const unlock = unlockTokens.get(groupId);
    if (unlock) headers.set("x-group-token", unlock);
    const owner = ownerTokens.get(groupId);
    if (owner) headers.set("x-owner-token", owner);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new Error("You look offline. Check your connection and try again.");
  }

  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (response.status === 403 && payload.locked) {
    throw new LockedError(payload.error || "This group is locked.", payload.group ?? null);
  }
  if (!response.ok) {
    throw new Error(payload.error || "That did not go through. Try again.");
  }
  return payload;
}

export const api = {
  listGroups: () => request<{ groups: Group[] }>("/api/groups"),

  createGroup: (input: { name: string; topic: string; password: string }) =>
    request<{ group: Group; ownerToken: string; unlockToken: string | null }>("/api/groups", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  messages: (groupId: string) => request<{ group: Group; messages: Message[] }>(`/api/groups/${groupId}/messages`, {}, groupId),

  sendMessage: (groupId: string, body: string, authorName: string) =>
    request<{ message: Message }>(
      `/api/groups/${groupId}/messages`,
      { method: "POST", body: JSON.stringify({ body, authorName }) },
      groupId,
    ),

  unlock: (groupId: string, password: string) =>
    request<{ token: string | null }>(`/api/groups/${groupId}/unlock`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  setLock: (groupId: string, lock: boolean, password: string) =>
    request<{ group: Group; unlockToken?: string }>(
      `/api/groups/${groupId}/lock`,
      { method: "POST", body: JSON.stringify({ lock, password }) },
      groupId,
    ),
};
