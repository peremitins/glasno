ALTER TABLE "interview_sessions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "anonymous_session_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "vacancy_url" text;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "resume_raw" text;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "question_count" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_sessions" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD COLUMN "kind" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD COLUMN "follow_up_for_turn_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD COLUMN "metadata" jsonb;