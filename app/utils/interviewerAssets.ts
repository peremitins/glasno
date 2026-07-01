import type { InterviewerFaceId } from '@/shared/dto';

export function getInterviewerFacePhotoSrc(faceId: InterviewerFaceId): string {
  return `/interviewers/${faceId}.webp`;
}
