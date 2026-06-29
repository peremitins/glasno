import {
  EmailLoginStartRequestDto,
  EmailLoginStartResponseDto,
} from '@/shared/dto';
import { createAuthService } from '@/server/application/auth/serviceFactory';
import { defineApiHandler } from '@/server/utils/handler';
import { readDto } from '@/server/utils/validate';

export default defineApiHandler(async (event) => {
  const input = await readDto(event, EmailLoginStartRequestDto);
  const result = await createAuthService(event).startEmailLogin(input);
  return EmailLoginStartResponseDto.parse(result);
});
