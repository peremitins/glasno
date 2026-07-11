ALTER TABLE "user_subscriptions" ADD COLUMN "charge_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "renewal_plan_id" text;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "renewal_amount_rub" integer;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "renewal_notice_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "user_subscriptions_user_id_uq" ON "user_subscriptions" USING btree ("user_id");