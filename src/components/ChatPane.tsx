import * as React from "react";
import { AlertTriangle, ArrowDown, Check, KeyRound, Loader2, Lock, RefreshCw, Send } from "lucide-react";
import type { Group, Identity, Message } from "../types";

type ChatStatus = "loading" | "ready" | "locked" | "offline";

interface ChatPaneProps {
  group: Group;
  identity: Identity;
  messages: Message[];
  status: ChatStatus;
  error: string;
  notice: string;
  canManageLock: boolean;
  onNameChange: (name: string) => void;
  onSend: (body: string) => Promise<boolean>;
  onUnlock: (password: string) => Promise<void>;
  onRefresh: () => void;
  onManageLock: () => void;
}

const MAX_BODY = 1000;
const COUNTER_FROM = 120;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => Array.from(part)[0] ?? "").join("");
  return letters.toUpperCase() || "?";
}

export function ChatPane({
  group,
  identity,
  messages,
  status,
  error,
  notice,
  canManageLock,
  onNameChange,
  onSend,
  onUnlock,
  onRefresh,
  onManageLock,
}: ChatPaneProps) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pinned, setPinned] = React.useState(true);
  const [unread, setUnread] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const draftRef = React.useRef<HTMLTextAreaElement>(null);
  const pinnedRef = React.useRef(true);
  const seenCountRef = React.useRef(0);

  const canSend = status === "ready" && !sending;

  React.useEffect(() => {
    pinnedRef.current = true;
    seenCountRef.current = 0;
    setDraft("");
    setPinned(true);
    setUnread(0);
  }, [group.id]);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const added = Math.max(0, messages.length - seenCountRef.current);
    seenCountRef.current = messages.length;
    if (pinnedRef.current) {
      list.scrollTop = list.scrollHeight;
      if (added > 0) setUnread(0);
    } else if (added > 0) {
      setUnread((count) => count + added);
    }
  }, [messages]);

  // Grow the message box with its content, up to the CSS max-height.
  React.useLayoutEffect(() => {
    const field = draftRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 132)}px`;
  }, [draft]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const list = event.currentTarget;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    const atBottom = distance < 96;
    pinnedRef.current = atBottom;
    setPinned(atBottom);
    if (atBottom) setUnread(0);
  };

  const scrollToLatest = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    pinnedRef.current = true;
    setPinned(true);
    setUnread(0);
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || !canSend) return;
    setSending(true);
    pinnedRef.current = true;
    setPinned(true);
    const sent = await onSend(body);
    if (sent) setDraft("");
    setSending(false);
    window.requestAnimationFrame(scrollToLatest);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const refresh = () => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 550);
  };

  const remaining = MAX_BODY - draft.length;
  const counting = remaining <= COUNTER_FROM && draft.length > 0;
  const topic = group.topic || (group.isHome ? "Everyone in the network." : "A group chat on math_class.");

  let previousAuthor: string | null = null;

  return (
    <main id="main" tabIndex={-1} className="chat" aria-label={group.name}>
      <header className="chat-head">
        <div className="chat-id">
          <div className="chat-titles">
            <h1>{group.name}</h1>
            <p>{topic}</p>
          </div>
          {(group.locked || group.isHome) && (
            <div className="chat-flags">
              {group.locked && (
                <span className="flag is-locked">
                  <Lock size={12} aria-hidden="true" />
                  Passcode required
                </span>
              )}
              {group.isHome && <span className="flag">Default room, open to everyone</span>}
            </div>
          )}
        </div>

        <div className="chat-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={refresh}
            aria-label="Refresh messages"
            aria-busy={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? "spinning" : undefined} aria-hidden="true" />
            <span className="btn-label">Refresh</span>
          </button>
          {canManageLock && !group.isHome && (
            <button type="button" className="ghost-btn" onClick={onManageLock} aria-label="Group passcode settings">
              <KeyRound size={14} aria-hidden="true" />
              <span className="btn-label">Passcode</span>
            </button>
          )}
        </div>
      </header>

      <div className="chat-body">
        {status === "locked" ? (
          <LockGate groupName={group.name} onUnlock={onUnlock} />
        ) : (
          <>
            <div
              className="message-list"
              ref={listRef}
              onScroll={handleScroll}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-busy={status === "loading"}
              aria-label="Messages"
              tabIndex={0}
            >
              {status === "loading" && messages.length === 0 && (
                <div className="chat-empty">
                  <p className="empty-loading">
                    <Loader2 size={15} className="spinning" aria-hidden="true" />
                    Connecting to chat…
                  </p>
                </div>
              )}

              {status !== "loading" && messages.length === 0 && (
                <div className="chat-empty">
                  <h2 className="chat-empty-title">No messages yet</h2>
                  <p>
                    {group.isHome
                      ? "Say hello and the whole network sees it."
                      : `Say something to open ${group.name}.`}
                  </p>
                </div>
              )}

              {messages.map((message) => {
                const mine = message.authorId === identity.id;
                const head = message.authorId !== previousAuthor;
                previousAuthor = message.authorId;
                return (
                  <article
                    key={message.id}
                    className={`msg${mine ? " mine" : ""}${message.pending ? " pending" : ""}${
                      head ? "" : " is-continuation"
                    }`}
                  >
                    <span
                      className={`msg-mark${head ? "" : " is-empty"}`}
                      aria-hidden={head ? undefined : true}
                    >
                      {head ? initials(mine ? identity.name || "You" : message.authorName) : ""}
                    </span>
                    <div className="msg-content">
                      {head && (
                        <div className="msg-meta">
                          <span className="msg-author">{mine ? "You" : message.authorName}</span>
                          {message.pending && <span className="msg-pending">Sending…</span>}
                        </div>
                      )}
                      <p className="msg-body">{message.body}</p>
                    </div>
                    <time className="msg-time" dateTime={new Date(message.createdAt).toISOString()}>
                      {timeFormat.format(message.createdAt)}
                    </time>
                  </article>
                );
              })}
            </div>

            {!pinned && (
              <button type="button" className="jump-latest" onClick={scrollToLatest}>
                <ArrowDown size={13} aria-hidden="true" />
                <span>Jump to latest</span>
                {unread > 0 && <span className="new-count">, {unread} new</span>}
              </button>
            )}
          </>
        )}
      </div>

      {notice && (
        <div className="notice-bar" role="status">
          <Check size={13} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="error-bar" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <label className="name-field">
          <span className="name-field-label">You</span>
          <input
            className="name-input"
            aria-label="Your name"
            name="displayName"
            value={identity.name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Nickname"
            maxLength={24}
            autoComplete="nickname"
            spellCheck={false}
          />
        </label>

        <div className="msg-input-wrap">
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-message"
            name="message"
            ref={draftRef}
            rows={1}
            className="msg-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              status === "locked"
                ? "Unlock this group to send messages"
                : status === "offline"
                  ? "Waiting for the connection…"
                  : "Write a message"
            }
            maxLength={MAX_BODY}
            autoComplete="off"
            enterKeyHint="send"
            disabled={status !== "ready"}
          />
          {status === "ready" &&
            (counting ? (
              <span className="msg-hint is-counting" role="status">
                {remaining} left
              </span>
            ) : (
              <span className="msg-hint" aria-hidden="true">
                Enter to send
              </span>
            ))}
        </div>

        <button
          type="submit"
          className="send-btn"
          disabled={!canSend || draft.trim().length === 0}
          aria-label="Send message"
        >
          {sending ? (
            <Loader2 size={15} className="spinning" aria-hidden="true" />
          ) : (
            <Send size={15} aria-hidden="true" />
          )}
          <span>Send</span>
        </button>
      </form>
    </main>
  );
}

function LockGate({ groupName, onUnlock }: { groupName: string; onUnlock: (password: string) => Promise<void> }) {
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await onUnlock(password);
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "That passcode did not work. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <p className="gate-label">
          <Lock size={13} aria-hidden="true" />
          Passcode required
        </p>
        <h2>{groupName} is locked</h2>
        <p>Enter the group passcode to read and post messages.</p>
        <form onSubmit={submit} className="gate-form">
          <label htmlFor="gate-passcode" className="sr-only">
            Group passcode
          </label>
          <input
            id="gate-passcode"
            ref={inputRef}
            name="passcode"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Group passcode"
            autoComplete="current-password"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={!password || busy}>
            {busy ? <Loader2 size={14} className="spinning" aria-hidden="true" /> : "Unlock"}
          </button>
        </form>
        {error && (
          <p className="gate-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
