import type { H3Event } from 'h3';
import type { z, ZodTypeAny } from 'zod';

// Чтение и валидация тела запроса через Zod-схему из shared/dto.
// При ошибке бросает ZodError — его ловит defineApiHandler и отдаёт E_VALIDATION.
export async function readDto<TSchema extends ZodTypeAny>(
  event: H3Event,
  schema: TSchema
): Promise<z.output<TSchema>> {
  const body = await readBody(event);
  return schema.parse(body);
}

// Валидация query-параметров.
export function queryDto<TSchema extends ZodTypeAny>(
  event: H3Event,
  schema: TSchema
): z.output<TSchema> {
  return schema.parse(getQuery(event));
}
