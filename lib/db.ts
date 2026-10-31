import { env } from 'cloudflare:workers';

export function getDb(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('D1 binding DB is unavailable');
  return db;
}

export function json<T>(value: T): string {
  return JSON.stringify(value);
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
