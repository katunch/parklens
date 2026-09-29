import pg from 'pg';
import { config } from './config.js';
import { log } from './lib/log.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings (never shift them through JS Date).
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

/** Anything we can run a query on: the pool or a checked-out client (inside a transaction). */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (err) => log.error('pg pool error', err));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}

export function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<R>> {
  return getPool().query<R>(text, values);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(maxAttempts = 60, delayMs = 1000): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await query('SELECT 1');
      return;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      log.info(`database not ready (attempt ${attempt}/${maxAttempts}): ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** Tiny helper to build parameterized WHERE clauses. */
export class SqlBuilder {
  readonly params: unknown[] = [];
  private readonly conditions: string[] = [];

  /** Adds a value and returns its placeholder ($n). */
  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  where(condition: string): this {
    this.conditions.push(condition);
    return this;
  }

  get whereSql(): string {
    return this.conditions.length ? `WHERE ${this.conditions.join(' AND ')}` : '';
  }
}

/** Escape LIKE/ILIKE wildcards in user input (used with ESCAPE '\'). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && (constraint === undefined || e.constraint === constraint);
}
