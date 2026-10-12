CREATE TABLE "mock_payments_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"pm_token" text NOT NULL,
	"last4" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_payments_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"charge_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"pm_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_payments_refunds_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"payment_method_token" text NOT NULL,
	"last4" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"charge_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"required_approvals" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_refund_id" text,
	"paid_to_payment_method_token" text,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	CONSTRAINT "refund_requests_amount_positive" CHECK ("refund_requests"."amount_cents" > 0),
	CONSTRAINT "refund_requests_required_approvals" CHECK ("refund_requests"."required_approvals" in (1, 2))
);
--> statement-breakpoint
ALTER TABLE "mock_payments_refunds" ADD CONSTRAINT "mock_payments_refunds_charge_id_mock_payments_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."mock_payments_charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mock_payments_refunds_charge_idx" ON "mock_payments_refunds" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "refund_requests_charge_idx" ON "refund_requests" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "refund_requests_created_by_idx" ON "refund_requests" USING btree ("created_by");