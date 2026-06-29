import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Единый пул соединений к Postgres. Строка подключения — из runtimeConfig
// (NUXT_DATABASE_URL). Отдельная база jobai, не общая с Mentala.
let pool: Pool | null = null;

export function getDb() {
  if (!pool) {
    const url = useRuntimeConfig().databaseUrl;
    if (!url) {
      throw new Error('NUXT_DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString: url });
  }
  return drizzle(pool, { schema });
}

export { schema };
