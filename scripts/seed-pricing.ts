import { config } from 'dotenv';
import { createAiUsageService } from '../server/application/aiUsage/serviceFactory';

// Заполняет таблицу ai_model_pricing из кода (server/application/aiUsage/pricing.ts).
// Запуск: pnpm db:seed-pricing
config({ path: '.env.development' });
config();

async function main() {
  await createAiUsageService().seedPricing();
  // eslint-disable-next-line no-console
  console.log('✓ ai_model_pricing засеян из OPENAI_PRICING');
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Не удалось засеять прайс-лист:', err);
  process.exit(1);
});
