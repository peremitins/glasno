ALTER TABLE "interview_reports" ADD COLUMN "status" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "question_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "interview_reports" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;