CREATE TABLE "realtime_voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"anonymous_session_id" text NOT NULL,
	"interview_session_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"end_reason" text,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"hard_limit_seconds" integer DEFAULT 1200 NOT NULL,
	"idle_timeout_seconds" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "realtime_voice_sessions" ADD CONSTRAINT "realtime_voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_voice_sessions" ADD CONSTRAINT "realtime_voice_sessions_interview_session_id_interview_sessions_id_fk" FOREIGN KEY ("interview_session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE no action ON UPDATE no action;