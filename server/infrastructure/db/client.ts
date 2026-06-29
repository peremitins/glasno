import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Единый пул соединений к Postgres. Строка подключения — из runtimeConfig
// (NUXT_DATABASE_URL). Отдельная база jobai, не общая с Mentala.
let pool: Pool | null = null;

function resolveDatabaseUrl(): string {
  // В Nitro берём из runtimeConfig; в standalone-скриптах (tsx) — из env.
  try {
    const url = useRuntimeConfig().databaseUrl as string;
    if (url) return url;
  } catch {
    // useRuntimeConfig недоступен вне Nuxt — ок, идём в env
  }
  return process.env.NUXT_DATABASE_URL || '';
}

export function getDb() {
  if (!pool) {
    const url = resolveDatabaseUrl();
    if (!url) {
      throw new Error('NUXT_DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString: url });
  }
  return drizzle(pool, { schema });
}

export { schema };
