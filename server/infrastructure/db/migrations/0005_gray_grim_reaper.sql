CREATE TABLE "ai_model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"input_per_m_tokens_usd" double precision DEFAULT 0 NOT NULL,
	"cached_input_per_m_tokens_usd" double precision DEFAULT 0 NOT NULL,
	"output_per_m_tokens_usd" double precision DEFAULT 0 NOT NULL,
	"audio_input_per_m_tokens_usd" double precision DEFAULT 0 NOT NULL,
	"audio_output_per_m_tokens_usd" double precision DEFAULT 0 NOT NULL,
	"tts_per_m_chars_usd" double precision DEFAULT 0 NOT NULL,
	"note" text,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_pricing_model_unique" UNIQUE("model")
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"anonymous_session_id" text,
	"interview_session_id" uuid,
	"kind" text NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"audio_seconds" double precision DEFAULT 0 NOT NULL,
	"characters" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"request_id" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_interview_session_id_interview_sessions_id_fk" FOREIGN KEY ("interview_session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE no action ON UPDATE no action;