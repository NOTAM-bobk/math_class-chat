import * as React from "react";
import { ChatPane } from "./components/ChatPane";
import { LockDialog, NewGroupDialog } from "./components/Dialogs";
import { Sidebar } from "./components/Sidebar";
import { api, LockedError, ownerTokens, unlockTokens } from "./api";
import { loadIdentity, saveIdentity } from "./identity";
import type { Group, Identity, Message } from "./types";

type ChatStatus = "loading" | "ready" | "locked" | "offline";

const FALLBACK_HOME: Group = {
  id: "home",
  name: "Home chat",
  topic: "Everyone in the network. Say hi.",
  locked: false,
  isHome: true,
  createdAt: 0,
  messageCount: 0,
  lastAt: null,
};

export default function App() {
  const [identity, setIdentity] = React.useState<Identity>(loadIdentity);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [selectedId, setSelectedId] = React.useState("home");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [status, setStatus] = React.useState<ChatStatus>("loading");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [dialog, setDialog] = React.useState<"new" | "lock" | null>(null);
  const [reload, setReload] = React.useState(0);

  const selectedGroup = groups.find((group) => group.id === selectedId) ?? (groups.length === 0 ? FALLBACK_HOME : null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // A hidden tab does not need to poll; it catches up on visibilitychange.
      if (document.hidden) return;
      try {
        const data = await api.listGroups();
        if (cancelled) return;
        setGroups(data.groups);
        if (!data.groups.some((group) => group.id === selectedId) && data.groups.length > 0) {
          setSelectedId(data.groups[0].id);
        }
      } catch {
        /* the group list keeps its last good copy while the network blips */
      }
    };
    void load();
    const timer = window.setInterval(load, 8_000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, selectedId]);

  React.useEffect(() => {
    setMessages([]);
    setStatus("loading");
    setError("");
  }, [selectedId]);

  React.useEffect(() => {
    let cancelled = false;
    let stopped = false;

    const load = async () => {
      if (stopped || document.hidden) return;
      try {
        const data = await api.messages(selectedId);
        if (cancelled) return;
        setMessages(data.messages);
        setStatus("ready");
        setError("");
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof LockedError) {
          stopped = true;
          setMessages([]);
          setStatus("locked");
          return;
        }
        setStatus((previous) => (previous === "ready" ? "ready" : "offline"));
        setError(loadError instanceof Error ? loadError.message : "Chat is unreachable right now. Try again.");
      }
    };

    void load();
    const timer = window.setInterval(load, 2_500);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedId, reload]);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const changeName = (name: string) => {
    const next = { ...identity, name: name.slice(0, 24) };
    setIdentity(next);
    saveIdentity(next);
  };

  const sendMessage = React.useCallback(
    async (body: string) => {
      const tempId = `local-${crypto.randomUUID()}`;
      const optimistic: Message = {
        id: tempId,
        groupId: selectedId,
        authorId: identity.id,
        authorName: identity.name || "Guest",
        body,
        createdAt: Date.now(),
        pending: true,
      };
      setMessages((current) => [...current, optimistic]);
      try {
        const { message } = await api.sendMessage(selectedId, body, identity.name || "Guest");
        setMessages((current) => [...current.filter((item) => item.id !== tempId), message]);
        setError("");
        return true;
      } catch (sendError) {
        setMessages((current) => current.filter((item) => item.id !== tempId));
        if (sendError instanceof LockedError) {
          setStatus("locked");
          setError("");
        } else {
          setError(sendError instanceof Error ? sendError.message : "That message did not send. Try again.");
        }
        return false;
      }
    },
    [identity.id, identity.name, selectedId],
  );

  const unlockGroup = async (password: string) => {
    const { token } = await api.unlock(selectedId, password);
    if (token) unlockTokens.set(selectedId, token);
    setNotice("Group unlocked.");
    setStatus("loading");
    setReload((value) => value + 1);
  };

  const createGroup = async (input: { name: string; topic: string; password: string }) => {
    const created = await api.createGroup(input);
    ownerTokens.set(created.group.id, created.ownerToken);
    if (created.unlockToken) unlockTokens.set(created.group.id, created.unlockToken);
    setGroups((current) => [created.group, ...current]);
    setSelectedId(created.group.id);
    setDialog(null);
    setReload((value) => value + 1);
    setNotice(created.group.locked ? "Group created and locked." : "Group created.");
  };

  const saveLock = async (lock: boolean, password: string) => {
    if (!selectedGroup) return;
    const result = await api.setLock(selectedGroup.id, lock, password);
    if (result.unlockToken) unlockTokens.set(selectedGroup.id, result.unlockToken);
    else if (!lock) unlockTokens.remove(selectedGroup.id);
    setGroups((current) => current.map((group) => (group.id === result.group.id ? result.group : group)));
    setDialog(null);
    setNotice(
      lock
        ? "Group locked. Share the passcode with your people."
        : "Lock removed. Anyone with the link can read this group.",
    );
    setReload((value) => value + 1);
  };

  const group = selectedGroup ?? FALLBACK_HOME;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to chat
      </a>

      <Sidebar groups={groups} selectedId={group.id} onSelect={setSelectedId} onNewGroup={() => setDialog("new")} />

      <ChatPane
        key={group.id}
        group={group}
        identity={identity}
        messages={messages}
        status={status}
        error={error}
        notice={notice}
        canManageLock={Boolean(ownerTokens.get(group.id)) && !group.isHome}
        onNameChange={changeName}
        onSend={sendMessage}
        onUnlock={unlockGroup}
        onRefresh={() => setReload((value) => value + 1)}
        onManageLock={() => setDialog("lock")}
      />

      {dialog === "new" && <NewGroupDialog onClose={() => setDialog(null)} onCreate={createGroup} />}

      {dialog === "lock" && selectedGroup && (
        <LockDialog group={selectedGroup} onClose={() => setDialog(null)} onSave={saveLock} />
      )}
    </div>
  );
}
