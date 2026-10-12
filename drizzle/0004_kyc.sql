CREATE TABLE "kyc_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"national_id" text NOT NULL,
	"country" text NOT NULL,
	"risk_level" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"proposed_by" text NOT NULL,
	"required_approvals" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"while_escalated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "kyc_decisions_required_approvals" CHECK ("kyc_decisions"."required_approvals" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE "kyc_notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kyc_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"case_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_decisions" ADD CONSTRAINT "kyc_decisions_case_id_kyc_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."kyc_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_decisions" ADD CONSTRAINT "kyc_decisions_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_notes" ADD CONSTRAINT "kyc_notes_case_id_kyc_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."kyc_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_notes" ADD CONSTRAINT "kyc_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kyc_cases_status_idx" ON "kyc_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kyc_cases_assigned_to_idx" ON "kyc_cases" USING btree ("assigned_to");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_decisions_one_pending_per_case" ON "kyc_decisions" USING btree ("case_id") WHERE "kyc_decisions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "kyc_notes_case_idx" ON "kyc_notes" USING btree ("case_id");