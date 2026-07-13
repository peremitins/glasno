// Нормализованный аватар всегда хранится как WebP по приватному ключу.
// Интерфейс не раскрывает S3-детали прикладному слою.
export interface AvatarStorage {
  putAvatar(userId: string, data: Buffer): Promise<void>;
  getAvatar(userId: string): Promise<Buffer | null>;
  deleteAvatar(userId: string): Promise<void>;
}

export interface AvatarImageProcessor {
  normalize(data: Buffer, mimeType: string | null): Promise<Buffer>;
}
