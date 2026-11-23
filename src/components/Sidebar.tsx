import { Hash, Home, Lock, MessageSquare, Plus } from "lucide-react";
import type { Group } from "../types";

interface SidebarProps {
  groups: Group[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNewGroup: () => void;
}

function relativeTime(stamp: number | null): string {
  if (!stamp) return "quiet";
  const seconds = Math.max(1, Math.round((Date.now() - stamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(stamp).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function Sidebar({ groups, selectedId, onSelect, onNewGroup }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Groups">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <MessageSquare size={15} />
        </span>
        <div className="brand-text">
          <span className="brand-name">math_class</span>
          <span className="brand-sub">network · chat</span>
        </div>
        <span className="brand-version">v1</span>
      </div>

      <button type="button" className="new-group" onClick={onNewGroup}>
        <Plus size={14} aria-hidden="true" />
        <span>New group</span>
      </button>

      <div className="groups-head">
        <h2>Groups</h2>
        <span className="groups-count">{groups.length}</span>
      </div>

      <nav className="group-list" aria-label="Chat groups">
        {groups.map((group) => {
          const active = group.id === selectedId;
          return (
            <button
              key={group.id}
              type="button"
              className={`group-card${active ? " is-active" : ""}`}
              onClick={() => onSelect(group.id)}
              aria-current={active ? "true" : undefined}
            >
              <span className="group-glyph" aria-hidden="true">
                {group.isHome ? <Home size={14} /> : group.locked ? <Lock size={14} /> : <Hash size={14} />}
              </span>
              <span className="group-text">
                <span className="group-name">{group.name}</span>
                <span className="group-meta">
                  {group.messageCount} {group.messageCount === 1 ? "message" : "messages"} · {relativeTime(group.lastAt)}
                </span>
              </span>
              {group.locked && <Lock size={11} className="group-lock" aria-label="Locked" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <span className="foot-dot" aria-hidden="true" />
        <span>math_class network</span>
      </div>
    </aside>
  );
}
