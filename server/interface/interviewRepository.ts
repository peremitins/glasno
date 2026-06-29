import type {
  InterviewLanguage,
  InterviewLevel,
  InterviewerAvatarId,
  InterviewerMode,
  InterviewSessionStatus,
  InterviewSourceType,
  InterviewTurnKind,
  QuestionHintPack,
} from '@/shared/dto';

export interface InterviewSessionRecord {
  id: string;
  anonymousSessionId: string;
  userId: string | null;
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
    questionSource?: 'jobai' | 'user';
    hintPack?: QuestionHintPack | null;
    [key: string]: unknown;
  } | null;
}

export interface InterviewRepository {
  createSession(
    input: CreateInterviewSessionRecordInput
  ): Promise<InterviewSessionRecord>;
  findSessionById(id: string): Promise<InterviewSessionRecord | null>;
  updateSessionStatus(
    id: string,
    status: InterviewSessionStatus
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
}
