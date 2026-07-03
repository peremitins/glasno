import { HealthResponseDto } from '@/shared/dto';

// Тонкий хендлер: только формирует ответ и валидирует через DTO.
// Бизнес-логика — в server/application (как в Mentala).
export default defineEventHandler(() => {
  return HealthResponseDto.parse({
    status: 'ok',
    service: 'glasno',
    time: new Date().toISOString(),
  });
});
