import * as React from "react";
import { Loader2, Lock, LockOpen, X } from "lucide-react";
import type { Group } from "../types";

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
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} aria-hidden="true" />
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
      setError(createError instanceof Error ? createError.message : "The group could not be created.");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New group"
      description="Make a room for a class, a table or a crew. Passcodes keep it private."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label className="field">
          <span>Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Period 3 study hall"
            maxLength={40}
            autoFocus
          />
        </label>

        <label className="field">
          <span>
            Topic <em>optional</em>
          </span>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="What is this group for?"
            maxLength={90}
          />
        </label>

        <div className={`switch-row${locked ? " is-on" : ""}`}>
          <span className="switch-label">
            <Lock size={13} aria-hidden="true" />
            <span>
              Lock with a passcode
              <em>Only people with the passcode can read or post.</em>
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={locked}
            aria-label="Lock this group with a passcode"
            className="switch"
            onClick={() => setLocked((value) => !value)}
          >
            <span />
          </button>
        </div>

        {locked && (
          <label className="field">
            <span>Passcode</span>
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
          <p className="form-error" role="alert">
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

  const run = async (lock: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(lock, password.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The lock could not be changed.");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Group passcode"
      description={
        group.locked
          ? "Change the passcode, or unlock the group for everyone."
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
          <span>{group.locked ? "New passcode" : "Passcode"}</span>
          <input
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 4 characters"
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          {group.locked && (
            <button type="button" className="btn btn-ghost danger" onClick={() => void run(false)} disabled={busy}>
              <LockOpen size={13} aria-hidden="true" />
              Remove lock
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={password.trim().length < 4 || busy}>
            {busy ? <Loader2 size={14} className="spinning" aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
            {group.locked ? "Save passcode" : "Lock group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
