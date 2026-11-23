/**
 * math_class chat — the API, independent of where it runs.
 *
 * Cloudflare passes a D1 binding, Vercel passes the libSQL adapter from
 * worker/db.js. Both expose the small surface the code below uses:
 * prepare(sql).bind(...).first()/all()/run() and batch(statements).
 */

const HOME_GROUP_ID = "home";
const MAX_GROUP_NAME = 40;
const MAX_TOPIC = 90;
const MAX_NICKNAME = 24;
const MAX_BODY = 1000;
const MESSAGE_PAGE = 80;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const fail = (error, status = 400) => json({ error }, status);

/* ------------------------------------------------------------------ crypto */

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(24)).buffer);
}

// Cloudflare's runtime refuses PBKDF2 above 100,000 iterations with a
// NotSupportedError, while local workerd does not enforce the cap, so this is
// the highest count that works on every host. Do not raise it without
// lowering it for Cloudflare again.
const PBKDF2_ITERATIONS = 100_000;

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(bits);
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/* ------------------------------------------------------------------ schema */

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS groups (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     topic TEXT,
     locked INTEGER NOT NULL DEFAULT 0,
     pass_hash TEXT,
     pass_salt TEXT,
     is_home INTEGER NOT NULL DEFAULT 0,
     created_by TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS group_owners (
     group_id TEXT PRIMARY KEY,
     token TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS group_unlocks (
     token TEXT PRIMARY KEY,
     group_id TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_group_unlocks_group ON group_unlocks(group_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
     id TEXT PRIMARY KEY,
     group_id TEXT NOT NULL,
     author_id TEXT NOT NULL,
     author_name TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_group_time ON messages(group_id, created_at)`,
];

let schemaReady = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A hosted database can return a transient error if several statements arrive
 * while it is still warming up, so the first-run work is retried.
 */
async function withRetry(work, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      await sleep(60 * (attempt + 1));
    }
  }
  throw lastError;
}

async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      // A read decides whether the tables exist, so steady-state requests never
      // need a write lock. Each statement runs on its own: DDL inside a batched
      // statement is what D1 rejects on a cold database.
      const tables = await withRetry(() =>
        db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'messages'").first(),
      );
      if (!tables) {
        for (const sql of SCHEMA_STATEMENTS) {
          await withRetry(() => db.prepare(sql).run());
        }
      }

      const home = await withRetry(() => db.prepare("SELECT id FROM groups WHERE id = ?").bind(HOME_GROUP_ID).first());
      if (!home) {
        await withRetry(() =>
          db
            .prepare(
              `INSERT OR IGNORE INTO groups (id, name, topic, locked, is_home, created_by, created_at)
               VALUES (?, ?, ?, 0, 1, 'system', ?)`,
            )
            .bind(HOME_GROUP_ID, "Home chat", "Everyone in the network. Say hi.", Date.now())
            .run(),
        );
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/* ------------------------------------------------------------------ helpers */

const cleanText = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

function toGroup(row) {
  return {
    id: row.id,
    name: row.name,
    topic: row.topic ?? null,
    locked: Boolean(row.locked),
    isHome: Boolean(row.is_home),
    createdAt: Number(row.created_at),
    messageCount: Number(row.message_count ?? 0),
    lastAt: row.last_at === null || row.last_at === undefined ? null : Number(row.last_at),
  };
}

function toMessage(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: Number(row.created_at),
  };
}

async function getGroup(db, id) {
  return db
    .prepare(
      `SELECT g.*,
              (SELECT COUNT(*) FROM messages m WHERE m.group_id = g.id) AS message_count,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.group_id = g.id) AS last_at
         FROM groups g
        WHERE g.id = ?`,
    )
    .bind(id)
    .first();
}

async function isOwner(db, groupId, token) {
  if (!token) return false;
  const row = await db.prepare(`SELECT token FROM group_owners WHERE group_id = ?`).bind(groupId).first();
  return Boolean(row) && constantTimeEqual(row.token, token);
}

async function hasUnlock(db, groupId, token) {
  if (!token) return false;
  const row = await db.prepare(`SELECT token FROM group_unlocks WHERE token = ? AND group_id = ?`).bind(token, groupId).first();
  return Boolean(row);
}

async function canReadGroup(db, request, group) {
  if (!group.locked) return true;
  if (await isOwner(db, group.id, request.headers.get("x-owner-token"))) return true;
  return hasUnlock(db, group.id, request.headers.get("x-group-token"));
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

// A light per-identity throttle so one tab cannot flood a group. It lives in
// the process, so it is a courtesy limit rather than a hard guarantee.
const recentSends = new Map();

function maySend(authorId) {
  const now = Date.now();
  const stamps = (recentSends.get(authorId) ?? []).filter((stamp) => now - stamp < 15_000);
  if (stamps.length >= 5) return false;
  stamps.push(now);
  recentSends.set(authorId, stamps);
  if (recentSends.size > 4000) recentSends.clear();
  return true;
}

/* -------------------------------------------------------------------- routes */

async function listGroups(db) {
  const { results } = await db
    .prepare(
      `SELECT g.*,
              (SELECT COUNT(*) FROM messages m WHERE m.group_id = g.id) AS message_count,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.group_id = g.id) AS last_at
         FROM groups g
        ORDER BY g.is_home DESC, COALESCE(last_at, g.created_at) DESC
        LIMIT 200`,
    )
    .all();
  return json({ groups: (results ?? []).map(toGroup) });
}

async function createGroup(db, request) {
  const body = await readJson(request);
  const name = cleanText(body.name, MAX_GROUP_NAME);
  const topic = cleanText(body.topic, MAX_TOPIC);
  const password = typeof body.password === "string" ? body.password.trim() : "";

  if (name.length < 2) return fail("Give the group a name with at least 2 characters.");
  if (password.length > 0 && password.length < 4) return fail("Passcodes need at least 4 characters.");

  const authorId = cleanText(request.headers.get("x-user-id"), 64) || "anon";
  const id = crypto.randomUUID();
  const ownerToken = randomToken();
  const now = Date.now();
  const salt = randomToken();
  const locked = password.length > 0 ? 1 : 0;

  await db.batch([
    db
      .prepare(
        `INSERT INTO groups (id, name, topic, locked, pass_hash, pass_salt, is_home, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(id, name, topic || null, locked, locked ? await hashPassword(password, salt) : null, locked ? salt : null, authorId, now),
    db.prepare(`INSERT INTO group_owners (group_id, token) VALUES (?, ?)`).bind(id, ownerToken),
  ]);

  let unlockToken = null;
  if (locked) {
    unlockToken = randomToken();
    await db
      .prepare(`INSERT INTO group_unlocks (token, group_id, created_at) VALUES (?, ?, ?)`)
      .bind(unlockToken, id, now)
      .run();
  }

  const group = await getGroup(db, id);
  return json({ group: toGroup(group), ownerToken, unlockToken }, 201);
}

async function unlockGroup(db, request, group) {
  if (!group.locked) return json({ token: null });
  const body = await readJson(request);
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) return fail("Enter the group passcode.", 400);

  const attempted = await hashPassword(password, group.pass_salt ?? "");
  if (!constantTimeEqual(attempted, group.pass_hash ?? "")) {
    return fail("That passcode is not right.", 401);
  }

  const token = randomToken();
  await db
    .prepare(`INSERT INTO group_unlocks (token, group_id, created_at) VALUES (?, ?, ?)`)
    .bind(token, group.id, Date.now())
    .run();
  return json({ token });
}

async function setLock(db, request, group) {
  if (group.is_home) return fail("The home chat cannot be locked.", 403);
  if (!(await isOwner(db, group.id, request.headers.get("x-owner-token")))) {
    return fail("Only the person who made this group can change its lock.", 403);
  }

  const body = await readJson(request);
  const lock = body.lock !== false;
  const now = Date.now();

  if (!lock) {
    await db.batch([
      db.prepare(`UPDATE groups SET locked = 0, pass_hash = NULL, pass_salt = NULL WHERE id = ?`).bind(group.id),
      db.prepare(`DELETE FROM group_unlocks WHERE group_id = ?`).bind(group.id),
    ]);
    return json({ group: toGroup(await getGroup(db, group.id)) });
  }

  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (password.length < 4) return fail("Passcodes need at least 4 characters.");
  if (password.length > 64) return fail("Keep the passcode under 64 characters.");

  const salt = randomToken();
  const hash = await hashPassword(password, salt);
  const unlockToken = randomToken();
  await db.batch([
    db.prepare(`UPDATE groups SET locked = 1, pass_hash = ?, pass_salt = ? WHERE id = ?`).bind(hash, salt, group.id),
    db.prepare(`DELETE FROM group_unlocks WHERE group_id = ?`).bind(group.id),
    db.prepare(`INSERT INTO group_unlocks (token, group_id, created_at) VALUES (?, ?, ?)`).bind(unlockToken, group.id, now),
  ]);
  return json({ group: toGroup(await getGroup(db, group.id)), unlockToken });
}

async function readMessages(db, request, group) {
  if (!(await canReadGroup(db, request, group))) {
    return json({ error: "This group is locked.", locked: true, group: toGroup(group) }, 403);
  }
  const { results } = await db
    .prepare(`SELECT * FROM messages WHERE group_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(group.id, MESSAGE_PAGE)
    .all();
  const messages = (results ?? []).map(toMessage).reverse();
  return json({ group: toGroup(group), messages });
}

async function writeMessage(db, request, group) {
  if (!(await canReadGroup(db, request, group))) {
    return json({ error: "This group is locked.", locked: true, group: toGroup(group) }, 403);
  }

  const body = await readJson(request);
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const authorId = cleanText(request.headers.get("x-user-id"), 64) || "anon";
  const authorName = cleanText(body.authorName, MAX_NICKNAME) || "Guest";

  if (!text) return fail("Write something first.");
  if (text.length > MAX_BODY) return fail(`Messages top out at ${MAX_BODY} characters.`);
  if (!maySend(authorId)) return fail("Slow down a moment before the next message.", 429);

  const message = {
    id: crypto.randomUUID(),
    group_id: group.id,
    author_id: authorId,
    author_name: authorName,
    body: text,
    created_at: Date.now(),
  };

  await db
    .prepare(`INSERT INTO messages (id, group_id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(message.id, message.group_id, message.author_id, message.author_name, message.body, message.created_at)
    .run();

  return json({ message: toMessage(message) }, 201);
}

async function handleApi(request, db) {
  await ensureSchema(db);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (path === "/api/health") return json({ ok: true });
  if (path === "/api/groups") {
    if (method === "GET") return listGroups(db);
    if (method === "POST") return createGroup(db, request);
    return fail("Method not allowed.", 405);
  }

  const match = path.match(/^\/api\/groups\/([A-Za-z0-9_-]+)(?:\/(messages|unlock|lock))?$/);
  if (!match) return fail("Not found.", 404);

  const groupId = match[1];
  const action = match[2] ?? "";
  if (!ID_PATTERN.test(groupId)) return fail("Not found.", 404);

  const row = await getGroup(db, groupId);
  if (!row) return fail("That group no longer exists.", 404);

  if (!action) {
    if (method !== "GET") return fail("Method not allowed.", 405);
    return json({ group: toGroup(row) });
  }

  if (action === "messages") {
    if (method === "GET") return readMessages(db, request, row);
    if (method === "POST") return writeMessage(db, request, row);
    return fail("Method not allowed.", 405);
  }

  if (action === "unlock" && method === "POST") return unlockGroup(db, request, row);
  if (action === "lock" && method === "POST") return setLock(db, request, row);

  return fail("Method not allowed.", 405);
}

/**
 * Entry point shared by the Cloudflare Worker and the Vercel function.
 */
export async function handleRequest(request, db) {
  if (!db) {
    return fail(
      "The chat database is not connected. Set the DB binding on Cloudflare, or TURSO_DATABASE_URL on Vercel.",
      500,
    );
  }
  try {
    return await handleApi(request, db);
  } catch (error) {
    console.error("chat api error", error);
    return fail("The chat hit a snag. Try again in a moment.", 500);
  }
}
