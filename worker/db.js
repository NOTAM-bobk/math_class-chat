/**
 * Database adapters.
 *
 * D1 already speaks the prepare/bind/first/all/run shape, so the caller can
 * hand it straight to the router. libSQL (Turso) has a similar but different
 * client API, so it is wrapped into the same shape here.
 */

/** libSQL can hand back bigint columns; JSON cannot serialise those. */
function normalizeRow(row) {
  if (!row) return row;
  let copy = null;
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") {
      copy ??= { ...row };
      copy[key] = Number(value);
    }
  }
  return copy ?? row;
}

function libsqlStatement(client, sql, args) {
  return {
    sql,
    args,
    bind: (...values) => libsqlStatement(client, sql, values),
    async first(column) {
      const result = await client.execute({ sql, args });
      const row = result.rows[0];
      if (!row) return null;
      const clean = normalizeRow(row);
      return column ? clean[column] : clean;
    },
    async all() {
      const result = await client.execute({ sql, args });
      return { results: result.rows.map(normalizeRow), success: true, meta: { changes: 0 } };
    },
    async run() {
      const result = await client.execute({ sql, args });
      return { success: true, meta: { changes: result.rowsAffected ?? 0 } };
    },
  };
}

/**
 * @param {{ execute: Function, batch: Function }} client a @libsql/client instance
 */
export function createLibsqlDatabase(client) {
  return {
    prepare: (sql) => libsqlStatement(client, sql, []),
    batch: (statements) =>
      client.batch(
        statements.map((statement) => ({ sql: statement.sql, args: statement.args ?? [] })),
        "write",
      ),
    async close() {
      if (typeof client.close === "function") client.close();
    },
  };
}
