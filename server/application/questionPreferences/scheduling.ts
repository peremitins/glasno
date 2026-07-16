interface RepeatPreferenceCandidate {
  id: string;
  question: string;
  lastPracticedAt: Date | null;
  createdAt: Date;
}

export function getRepeatQuestionLimit(
  questionCount: number,
  userQuestionCount = 0
): number {
  const freeSlots = Math.max(0, questionCount - userQuestionCount);
  // Пользовательские вопросы не вытесняем и всегда оставляем одно место
  // для нового вопроса по контексту конкретной вакансии и резюме.
  return Math.max(0, freeSlots - 1);
}

export function selectRepeatPreferences<T extends RepeatPreferenceCandidate>(
  preferences: T[],
  limit: number
): T[] {
  return [...preferences]
    .sort((left, right) => {
      const leftTime = left.lastPracticedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightTime = right.lastPracticedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.createdAt.getTime() - right.createdAt.getTime();
    })
    .slice(0, Math.max(0, limit));
}
