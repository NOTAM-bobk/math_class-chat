import { Lock, Plus } from "lucide-react";
import type { Group } from "../types";

interface SidebarProps {
  groups: Group[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNewGroup: () => void;
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function relativeTime(stamp: number | null): string {
  if (!stamp) return "No messages yet";
  const seconds = Math.max(1, Math.round((Date.now() - stamp) / 1000));
  if (seconds < 60) return "Active now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate.format(stamp);
}

function roomLabel(group: Group): string {
  const messages = `${group.messageCount} ${group.messageCount === 1 ? "message" : "messages"}`;
  const lock = group.locked ? ", passcode set" : "";
  return `${group.name}, ${messages}${lock}. ${relativeTime(group.lastAt)}`;
}

export function Sidebar({ groups, selectedId, onSelect, onNewGroup }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Groups">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
            <path d="M3.5 3.5h17v17h-17z" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
            <path d="M14.8 14.8h5.7v5.7h-5.7z" fill="currentColor" />
          </svg>
        </span>
        <div className="brand-text">
          <span className="brand-name" translate="no">
            math_class
          </span>
          <span className="brand-sub">chat</span>
        </div>
      </div>

      <button type="button" className="new-group" onClick={onNewGroup}>
        <Plus size={15} aria-hidden="true" />
        <span>New group</span>
      </button>

      <div className="groups-head">
        <h2 id="groups-heading">Groups</h2>
        <span className="groups-count">
          {groups.length}
          <span className="sr-only"> {groups.length === 1 ? "group" : "groups"}</span>
        </span>
      </div>

      <nav className="group-list" aria-labelledby="groups-heading">
        {groups.map((group) => {
          const active = group.id === selectedId;
          return (
            <button
              key={group.id}
              type="button"
              className={`group-card${active ? " is-active" : ""}`}
              onClick={() => onSelect(group.id)}
              aria-current={active ? "true" : undefined}
              aria-label={roomLabel(group)}
            >
              <span className="group-line">
                <span className="group-name">{group.name}</span>
                {group.locked && <Lock size={11} className="group-lock" aria-hidden="true" />}
                <span className="group-leader" aria-hidden="true" />
                <span className="group-count">{group.messageCount}</span>
              </span>
              <span className="group-meta">{relativeTime(group.lastAt)}</span>
            </button>
          );
        })}
      </nav>

      <p className="sidebar-foot">Messages refresh automatically</p>
    </aside>
  );
}
