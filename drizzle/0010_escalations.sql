CREATE TYPE "public"."escalation_status" AS ENUM('open', 'distributed', 'closed');--> statement-breakpoint
CREATE TABLE "escalation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escalation_id" uuid NOT NULL,
	"rank_id" uuid NOT NULL,
	"requested" integer NOT NULL,
	CONSTRAINT "escalation_lines_ck" CHECK ("escalation_lines"."requested" > 0)
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"from_unit_id" uuid NOT NULL,
	"status" "escalation_status" DEFAULT 'open' NOT NULL,
	"note" text,
	"deadline_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"distributed_at" timestamp with time zone,
	"distributed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "force_requests" ADD COLUMN "escalation_id" uuid;--> statement-breakpoint
ALTER TABLE "escalation_lines" ADD CONSTRAINT "escalation_lines_escalation_id_escalations_id_fk" FOREIGN KEY ("escalation_id") REFERENCES "public"."escalations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_lines" ADD CONSTRAINT "escalation_lines_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_from_unit_id_units_id_fk" FOREIGN KEY ("from_unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_distributed_by_users_id_fk" FOREIGN KEY ("distributed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_lines_uq" ON "escalation_lines" USING btree ("escalation_id","rank_id");--> statement-breakpoint
CREATE INDEX "escalations_status_idx" ON "escalations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escalations_plan_idx" ON "escalations" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "force_requests" ADD CONSTRAINT "force_requests_escalation_id_escalations_id_fk" FOREIGN KEY ("escalation_id") REFERENCES "public"."escalations"("id") ON DELETE set null ON UPDATE no action;