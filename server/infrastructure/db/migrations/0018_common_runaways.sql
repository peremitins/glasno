CREATE TABLE "trial_grant_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"telegram_id" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_grant_history_email_unique" UNIQUE("email"),
	CONSTRAINT "trial_grant_history_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
ALTER TABLE "trial_grant_history" ADD CONSTRAINT "trial_grant_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;