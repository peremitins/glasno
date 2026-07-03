CREATE TABLE "user_payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'yookassa' NOT NULL,
	"provider_payment_method_id" text NOT NULL,
	"method_type" text,
	"title" text,
	"card_brand" text,
	"card_last4" text,
	"card_expiry_month" text,
	"card_expiry_year" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "auto_renew" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "next_charge_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "last_charge_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "last_charge_error" text;--> statement-breakpoint
ALTER TABLE "user_payment_methods" ADD CONSTRAINT "user_payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_payment_methods_user_id_uq" ON "user_payment_methods" USING btree ("user_id");