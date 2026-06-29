import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit по умолчанию читает только .env. Мы используем .env.development
// (как в Mentala), поэтому подгружаем его явно. .env — как fallback.
config({ path: '.env.development' });
config();

// Миграции пишутся в server/infrastructure/db/migrations.
// Команды: pnpm db:generate (после правок schema.ts) -> pnpm db:migrate.
export default defineConfig({
  schema: './server/infrastructure/db/schema.ts',
  out: './server/infrastructure/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NUXT_DATABASE_URL || '',
  },
});
