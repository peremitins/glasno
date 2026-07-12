CREATE TABLE "interview_question_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"anonymous_session_id" text NOT NULL,
	"status" text NOT NULL,
	"question" text NOT NULL,
	"concept_key" text NOT NULL,
	"semantic" jsonb,
	"role_key" text NOT NULL,
	"role_label" text NOT NULL,
	"level" text NOT NULL,
	"context_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"focus" text,
	"source_session_id" uuid,
	"source_turn_id" uuid,
	"last_practiced_at" timestamp with time zone,
	"practice_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_question_preferences" ADD CONSTRAINT "interview_question_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_question_preferences" ADD CONSTRAINT "interview_question_preferences_source_session_id_interview_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_question_preferences" ADD CONSTRAINT "interview_question_preferences_source_turn_id_interview_turns_id_fk" FOREIGN KEY ("source_turn_id") REFERENCES "public"."interview_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_preferences_user_status_idx" ON "interview_question_preferences" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "question_preferences_anon_status_idx" ON "interview_question_preferences" USING btree ("anonymous_session_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "question_preferences_user_concept_unique" ON "interview_question_preferences" USING btree ("user_id","role_key","level","concept_key") WHERE "interview_question_preferences"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "question_preferences_anon_concept_unique" ON "interview_question_preferences" USING btree ("anonymous_session_id","role_key","level","concept_key") WHERE "interview_question_preferences"."user_id" is null;