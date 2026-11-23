import * as React from "react";
import { AlertTriangle, ArrowDown, KeyRound, Loader2, Lock, Radio, RefreshCw, Send, Sparkles } from "lucide-react";
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

const timeLabel = (stamp: number) =>
  new Date(stamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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
    const added = messages.length - seenCountRef.current;
    seenCountRef.current = messages.length;
    if (pinnedRef.current) {
      list.scrollTop = list.scrollHeight;
      if (added > 0) setUnread(0);
    } else if (added > 0) {
      setUnread((count) => count + added);
    }
  }, [messages]);

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

  const refresh = () => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 550);
  };

  const remaining = MAX_BODY - draft.length;

  return (
    <section className="chat panel" aria-label={`${group.name} chat`}>
      <header className="chat-head">
        <div className="chat-id">
          <span className="chip-icon" aria-hidden="true">
            <Radio size={14} />
          </span>
          <div className="chat-titles">
            <h1>{group.name}</h1>
            <p>{group.topic || (group.isHome ? "Everyone in the network" : "Group chat")}</p>
          </div>
          {group.locked && (
            <span className="pill lock-pill" title="This group needs a passcode">
              <Lock size={11} aria-hidden="true" />
              Locked
            </span>
          )}
          {group.isHome && <span className="pill home-pill">Default</span>}
        </div>

        <div className="chat-actions">
          <button type="button" className="icon-btn" onClick={refresh} title="Refresh messages" aria-label="Refresh messages">
            <RefreshCw size={14} className={refreshing ? "spinning" : undefined} aria-hidden="true" />
          </button>
          {canManageLock && !group.isHome && (
            <button
              type="button"
              className="icon-btn"
              onClick={onManageLock}
              title="Group passcode"
              aria-label="Group passcode settings"
            >
              <KeyRound size={14} aria-hidden="true" />
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
              aria-label="Messages"
              tabIndex={0}
            >
              {status === "loading" && messages.length === 0 && (
                <div className="chat-empty">
                  <Loader2 size={18} className="spinning dim" aria-hidden="true" />
                  <p>Connecting to chat…</p>
                </div>
              )}

              {status !== "loading" && messages.length === 0 && (
                <div className="chat-empty">
                  <Sparkles size={20} className="dim" aria-hidden="true" />
                  <p className="chat-empty-title">No messages yet</p>
                  <p className="chat-empty-sub">
                    {group.isHome ? "Be the first to say hi to the network." : `Start ${group.name} off with a message.`}
                  </p>
                </div>
              )}

              {messages.map((message) => {
                const mine = message.authorId === identity.id;
                return (
                  <article key={message.id} className={`msg ${mine ? "mine" : "theirs"}${message.pending ? " pending" : ""}`}>
                    <div className="msg-meta">
                      <span className="msg-author">{mine ? "You" : message.authorName}</span>
                      <span className="msg-time">{timeLabel(message.createdAt)}</span>
                      {message.pending && <span className="msg-time">sending…</span>}
                    </div>
                    <div className="bubble">{message.body}</div>
                  </article>
                );
              })}
            </div>

            {!pinned && (
              <button type="button" className="latest-btn" onClick={scrollToLatest}>
                <ArrowDown size={13} aria-hidden="true" />
                <span>Latest messages</span>
                {unread > 0 && <span className="unread">{unread}</span>}
              </button>
            )}
          </>
        )}
      </div>

      {notice && (
        <div className="notice-bar" role="status">
          <Lock size={13} aria-hidden="true" />
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
        <label htmlFor="chat-name" className="sr-only">
          Your display name
        </label>
        <input
          id="chat-name"
          className="name-input"
          value={identity.name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Nickname"
          maxLength={24}
          autoComplete="nickname"
          spellCheck={false}
          title="Your display name in chat"
        />

        <div className="msg-input-wrap">
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <input
            id="chat-message"
            className="msg-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              status === "locked"
                ? "Unlock this group to send messages…"
                : status === "offline"
                  ? "Waiting for the connection…"
                  : "Message"
            }
            maxLength={MAX_BODY}
            autoComplete="off"
            enterKeyHint="send"
            disabled={status !== "ready"}
          />
          {remaining <= 120 && draft.length > 0 && <span className="counter">{remaining}</span>}
          {remaining > 120 && <kbd aria-hidden="true">↵ Enter</kbd>}
        </div>

        <button type="submit" className="send-btn" disabled={!canSend || draft.trim().length === 0} aria-label="Send message">
          <Send size={14} className={sending ? "pulse" : undefined} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}

function LockGate({ groupName, onUnlock }: { groupName: string; onUnlock: (password: string) => Promise<void> }) {
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await onUnlock(password);
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "That passcode did not work.");
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <span className="gate-icon" aria-hidden="true">
          <Lock size={18} />
        </span>
        <h2>{groupName} is locked</h2>
        <p>Enter the group passcode to read and send messages.</p>
        <form onSubmit={submit} className="gate-form">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Group passcode"
            autoFocus
            autoComplete="current-password"
            aria-label="Group passcode"
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
