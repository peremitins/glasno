// Компактный список уточняющих вопросов, которые интервьюер уже задал по
// текущему вопросу. Диалог и так передаётся модели целиком, но явный
// нумерованный список заметнее для неё, чем те же вопросы внутри длинной
// переписки, и почти ничего не стоит по токенам: только вопросы, без ответов.

export interface AskedQuestionsDialogueMessage {
  role: 'user' | 'interviewer';
  content: string;
}

const MAX_ASKED_QUESTIONS = 8;
const MAX_ASKED_QUESTION_LENGTH = 200;

// Предложения-переходы («Готовы перейти к следующему вопросу?») — не
// уточняющие вопросы, в список не попадают. Паттерн тот же, что в
// isMoveOnPrompt на сервере.
const MOVE_ON_PROMPT_PATTERN =
  /следующ[а-яё]*\s+вопрос|перей[а-яё]*\s+(?:к|ко)\s+следующ|дальше/iu;

export function collectAskedInterviewerQuestions(
  dialogue: AskedQuestionsDialogueMessage[],
  currentQuestion = ''
): string[] {
  const currentQuestionKey = normalizeQuestionKey(currentQuestion);
  const seen = new Set<string>();
  const questions: string[] = [];

  for (const message of dialogue) {
    if (message.role !== 'interviewer') continue;
    for (const question of extractQuestionSentences(message.content)) {
      if (MOVE_ON_PROMPT_PATTERN.test(question)) continue;
      const key = normalizeQuestionKey(question);
      // Основной вопрос показывается модели отдельной строкой контекста;
      // его повтор (озвучка, переформулировка по просьбе) — не дубль уточнения.
      if (!key || key === currentQuestionKey || seen.has(key)) continue;
      seen.add(key);
      questions.push(truncateQuestion(question));
    }
  }

  return questions.slice(-MAX_ASKED_QUESTIONS);
}

// Готовый блок для промпта. Пустая строка, если уточнений ещё не было.
export function buildAskedQuestionsReminder(
  dialogue: AskedQuestionsDialogueMessage[],
  currentQuestion = ''
): string {
  const questions = collectAskedInterviewerQuestions(dialogue, currentQuestion);
  if (!questions.length) return '';

  return [
    'Уточняющие вопросы, которые ты УЖЕ задал по текущему вопросу:',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    'Не повторяй их и не задавай их переформулировки. Новое уточнение допустимо только про ещё не выясненный аспект; если такого не осталось — предложи перейти к следующему вопросу.',
  ].join('\n');
}

function extractQuestionSentences(content: string): string[] {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('?')) return [];
  return (normalized.match(/[^.?!]+\?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 2);
}

function normalizeQuestionKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function truncateQuestion(question: string): string {
  return question.length > MAX_ASKED_QUESTION_LENGTH
    ? `${question.slice(0, MAX_ASKED_QUESTION_LENGTH - 1)}…`
    : question;
}
