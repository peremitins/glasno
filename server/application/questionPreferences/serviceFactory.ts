import type { H3Event } from 'h3';
import { QuestionPreferenceService } from './questionPreferenceService';
import { DrizzleQuestionPreferenceRepository } from '@/server/infrastructure/questionPreferences/drizzleQuestionPreferenceRepository';
import { DrizzleInterviewRepository } from '@/server/infrastructure/interview/drizzleInterviewRepository';

export function createQuestionPreferenceService(
  _event?: H3Event
): QuestionPreferenceService {
  return new QuestionPreferenceService({
    repository: new DrizzleQuestionPreferenceRepository(),
    interviewRepository: new DrizzleInterviewRepository(),
  });
}
