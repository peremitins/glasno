import { defineConfig } from 'drizzle-kit';

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
