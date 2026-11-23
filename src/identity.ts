import type { Identity } from "./types";

const IDENTITY_KEY = "mathclass_chat_identity";

function persist(identity: Identity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* private browsing: the session still works, it just will not be remembered */
  }
}

const guestName = () => `Guest_${Math.floor(100 + Math.random() * 900)}`;

/**
 * Reads the guest identity, creating and persisting one the first time.
 * Every caller in a session must see the same id, so a freshly minted identity
 * is written back before it is returned.
 */
export function loadIdentity(): Identity {
  try {
    const stored = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null") as Partial<Identity> | null;
    if (stored && typeof stored.id === "string" && stored.id.length > 0) {
      const identity: Identity = {
        id: stored.id,
        name: typeof stored.name === "string" && stored.name.length > 0 ? stored.name : guestName(),
      };
      persist(identity);
      return identity;
    }
  } catch {
    /* fall through to a fresh guest */
  }

  const identity: Identity = { id: crypto.randomUUID(), name: guestName() };
  persist(identity);
  return identity;
}

export function saveIdentity(identity: Identity) {
  persist(identity);
}
