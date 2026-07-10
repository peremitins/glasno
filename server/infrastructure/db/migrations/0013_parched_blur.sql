CREATE TABLE "gift_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"purchaser_user_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"paid_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"claimed_by_user_id" uuid,
	"notification_status" text DEFAULT 'pending' NOT NULL,
	"notification_attempts" integer DEFAULT 0 NOT NULL,
	"notification_next_attempt_at" timestamp with time zone,
	"notification_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift_entitlements" ADD CONSTRAINT "gift_entitlements_order_id_payment_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."payment_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_entitlements" ADD CONSTRAINT "gift_entitlements_purchaser_user_id_users_id_fk" FOREIGN KEY ("purchaser_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_entitlements" ADD CONSTRAINT "gift_entitlements_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_entitlements_order_id_uq" ON "gift_entitlements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "gift_entitlements_recipient_status_expiry_idx" ON "gift_entitlements" USING btree ("recipient_email","status","claim_expires_at");--> statement-breakpoint
CREATE INDEX "gift_entitlements_purchaser_created_at_idx" ON "gift_entitlements" USING btree ("purchaser_user_id","created_at");--> statement-breakpoint
CREATE INDEX "gift_entitlements_notification_queue_idx" ON "gift_entitlements" USING btree ("notification_status","notification_next_attempt_at");--> statement-breakpoint
CREATE INDEX "payment_orders_user_id_created_at_idx" ON "payment_orders" USING btree ("user_id","created_at","id");