ALTER TABLE "question_bank" ALTER COLUMN "is_public" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "corpus_id" text;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "framework" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "topic" text;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "subtopic" text;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "interview_type" text DEFAULT 'technical' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "seniority" text DEFAULT 'middle' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "difficulty_level" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "answer_format" text;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "expected_concepts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "status" text DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "technical_review" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "editorial_review" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "question_bank" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "question_bank_corpus_id_uq" ON "question_bank" USING btree ("corpus_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_bank_slug_uq" ON "question_bank" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "question_bank_admin_filters_idx" ON "question_bank" USING btree ("role","framework","seniority","topic");--> statement-breakpoint
CREATE INDEX "question_bank_review_idx" ON "question_bank" USING btree ("technical_review","editorial_review","status");