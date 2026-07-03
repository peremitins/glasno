CREATE TABLE "realtime_minute_debits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"realtime_session_id" uuid,
	"seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realtime_minute_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"source_type" text NOT NULL,
	"subscription_id" uuid,
	"provider_payment_id" text,
	"total_seconds" integer NOT NULL,
	"consumed_seconds" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "realtime_minute_debits" ADD CONSTRAINT "realtime_minute_debits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_minute_debits" ADD CONSTRAINT "realtime_minute_debits_grant_id_realtime_minute_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."realtime_minute_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_minute_debits" ADD CONSTRAINT "realtime_minute_debits_realtime_session_id_realtime_voice_sessions_id_fk" FOREIGN KEY ("realtime_session_id") REFERENCES "public"."realtime_voice_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_minute_grants" ADD CONSTRAINT "realtime_minute_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_minute_grants" ADD CONSTRAINT "realtime_minute_grants_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "realtime_minute_debits_user_id_idx" ON "realtime_minute_debits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "realtime_minute_grants_user_id_idx" ON "realtime_minute_grants" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_subscriptions_provider_payment_id_uq" ON "user_subscriptions" USING btree ("provider_payment_id");