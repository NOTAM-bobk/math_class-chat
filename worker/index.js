/**
 * Cloudflare Workers entry point.
 *
 * Static assets come from the `dist` build through the ASSETS binding
 * (see wrangler.jsonc); everything under /api is handled by the shared router
 * with the D1 binding as the database.
 */

import { handleRequest } from "./app.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleRequest(request, env.DB);
    }
    return env.ASSETS.fetch(request);
  },
};
