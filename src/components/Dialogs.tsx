import * as React from "react";
import { Loader2, Lock, LockOpen, X } from "lucide-react";
import type { Group } from "../types";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);

  React.useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel && window.matchMedia("(pointer: fine)").matches) {
      (panel.querySelector<HTMLElement>("input, textarea, select") ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnTo?.focus();
    };
  }, []);

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={panelRef}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => closeRef.current()} aria-label="Close dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function NewGroupDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; topic: string; password: string }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [locked, setLocked] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const valid = name.trim().length >= 2 && (!locked || password.trim().length >= 4);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), topic: topic.trim(), password: locked ? password.trim() : "" });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The group could not be created. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New group"
      description="Make a room for a class, a table or a crew. A passcode keeps it private."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Period 3 study hall"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span className="field-label">
            Topic <span className="optional">Optional</span>
          </span>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What is this group for?"
            maxLength={90}
            autoComplete="off"
          />
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={locked}
          className={`switch-row${locked ? " is-on" : ""}`}
          onClick={() => setLocked((value) => !value)}
        >
          <span className="switch-copy">
            <Lock size={14} aria-hidden="true" />
            <span>
              Lock with a passcode
              <span className="switch-hint">Only people with the passcode can read or post.</span>
            </span>
          </span>
          <span className="switch-track" aria-hidden="true">
            <span />
          </span>
        </button>

        {locked && (
          <label className="field">
            <span className="field-label">Passcode</span>
            <input
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 4 characters"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
            {busy ? <Loader2 size={14} className="spinning" aria-hidden="true" /> : "Create group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function LockDialog({
  group,
  onClose,
  onSave,
}: {
  group: Group;
  onClose: () => void;
  onSave: (lock: boolean, password: string) => Promise<void>;
}) {
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  const run = async (lock: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(lock, password.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The lock could not be changed. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Group passcode"
      description={
        group.locked
          ? "Change the passcode, or remove the lock so anyone can read the group."
          : "Lock this group so only people with the passcode can read it."
      }
      onClose={onClose}
    >
      <form
        className="modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(true);
        }}
      >
        <label className="field">
          <span className="field-label">{group.locked ? "New passcode" : "Passcode"}</span>
          <input
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 4 characters"
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        {confirming && (
          <div className="confirm-note">
            <p>Remove the passcode? Anyone will be able to read and post in {group.name}.</p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Keep lock
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void run(false)} disabled={busy}>
                {busy ? <Loader2 size={14} className="spinning" aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
                Remove lock
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {group.locked && !confirming && (
            <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)} disabled={busy}>
              <LockOpen size={14} aria-hidden="true" />
              Remove lock
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={password.trim().length < 4 || busy}>
            {busy ? (
              <Loader2 size={14} className="spinning" aria-hidden="true" />
            ) : (
              <Lock size={14} aria-hidden="true" />
            )}
            {group.locked ? "Save passcode" : "Lock group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
