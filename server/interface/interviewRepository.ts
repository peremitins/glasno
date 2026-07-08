import type {
  InterviewLanguage,
  InterviewLevel,
  InterviewerAvatarId,
  InterviewerMode,
  InterviewSessionStatus,
  InterviewSourceType,
  InterviewTrainingMode,
  InterviewTurnKind,
  QuestionHintPack,
} from '@/shared/dto';

export interface InterviewSessionRecord {
  id: string;
  anonymousSessionId: string;
  userId: string | null;
  trainingMode: InterviewTrainingMode;
  source: InterviewSourceType;
  vacancyTitle: string | null;
  vacancyRaw: string | null;
  vacancyUrl: string | null;
  companyName: string | null;
  resumeRaw: string | null;
  role: string | null;
  level: InterviewLevel | null;
  questionCount: number;
  language: InterviewLanguage;
  interviewerMode: InterviewerMode;
  interviewerAvatarId: InterviewerAvatarId;
  status: InterviewSessionStatus;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface InterviewTurnRecord {
  id: string;
  sessionId: string;
  index: number;
  kind: InterviewTurnKind;
  question: string;
  answerTranscript: string | null;
  followUpForTurnId: string | null;
  metadata: Record<string, unknown> | null;
  answeredAt: Date | null;
  createdAt: Date;
}

export interface CreateInterviewSessionRecordInput {
  anonymousSessionId: string;
  userId?: string | null;
  trainingMode: InterviewTrainingMode;
  source: InterviewSourceType;
  vacancyTitle?: string | null;
  vacancyRaw?: string | null;
  vacancyUrl?: string | null;
  companyName?: string | null;
  resumeRaw?: string | null;
  role?: string | null;
  level?: InterviewLevel | null;
  questionCount: number;
  language: InterviewLanguage;
  interviewerMode: InterviewerMode;
  interviewerAvatarId: InterviewerAvatarId;
  status: InterviewSessionStatus;
  metadata?: Record<string, unknown> | null;
}

export interface CreateInterviewTurnRecordInput {
  sessionId: string;
  index: number;
  kind: InterviewTurnKind;
  question: string;
  followUpForTurnId?: string | null;
  metadata?: {
    planItemId?: string | null;
    questionSource?: 'glasno' | 'user';
    hintPack?: QuestionHintPack | null;
    [key: string]: unknown;
  } | null;
}

export interface InterviewRepository {
  createSession(
    input: CreateInterviewSessionRecordInput
  ): Promise<InterviewSessionRecord>;
  findSessionById(id: string): Promise<InterviewSessionRecord | null>;
  deleteSession(id: string): Promise<boolean>;
  updateSessionStatus(
    id: string,
    status: InterviewSessionStatus
  ): Promise<InterviewSessionRecord | null>;
  // Смена интервьюера: тон (mode), персона-аватар и metadata (с faceId).
  updateSessionInterviewer(
    id: string,
    fields: {
      interviewerMode: InterviewerMode;
      interviewerAvatarId: InterviewerAvatarId;
      metadata: Record<string, unknown>;
    }
  ): Promise<InterviewSessionRecord | null>;
  listTurns(sessionId: string): Promise<InterviewTurnRecord[]>;
  findTurnById(
    sessionId: string,
    turnId: string
  ): Promise<InterviewTurnRecord | null>;
  createTurn(input: CreateInterviewTurnRecordInput): Promise<InterviewTurnRecord>;
  saveTurnAnswer(
    sessionId: string,
    turnId: string,
    answer: string
  ): Promise<InterviewTurnRecord | null>;
  // Перезаписывает metadata турна целиком (для хранения диалога/suggestMoveOn).
  updateTurnMetadata(
    sessionId: string,
    turnId: string,
    metadata: Record<string, unknown>
  ): Promise<InterviewTurnRecord | null>;
}
