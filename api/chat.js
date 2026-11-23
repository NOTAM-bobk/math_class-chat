/**
 * Vercel entry point.
 *
 * vercel.json rewrites /api/* to this function and hands the rest of the path
 * over as ?path=... so one function can serve every route. The router itself
 * lives in worker/app.js and is the same code Cloudflare runs.
 */

import { createClient } from "@libsql/client/web";
import { handleRequest } from "../worker/app.js";
import { createLibsqlDatabase } from "../worker/db.js";

const FUNCTION_PATHS = new Set(["/api/chat", "/api/index"]);
const DATABASE_URL = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;

let database = null;

function getDatabase() {
  if (!DATABASE_URL) return null;
  if (!database) {
    database = createLibsqlDatabase(createClient({ url: DATABASE_URL, authToken: AUTH_TOKEN || undefined }));
  }
  return database;
}

/**
 * Returns the public /api path this request is for. Vercel may rewrite the URL
 * to this function (path arrives as ?path=) or keep the original one; both are
 * handled so the route table in worker/app.js sees the path the client called.
 */
export function resolveApiPath(request) {
  const url = new URL(request.url);
  if (!FUNCTION_PATHS.has(url.pathname)) return url.pathname;
  const rest = (url.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
  return rest ? `/api/${rest}` : "/api";
}

export default {
  async fetch(request) {
    const target = new URL(request.url);
    target.pathname = resolveApiPath(request);
    target.search = "";
    return handleRequest(new Request(target, request), getDatabase());
  },
};
