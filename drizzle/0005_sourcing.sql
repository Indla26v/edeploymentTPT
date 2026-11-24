CREATE TYPE "public"."force_request_kind" AS ENUM('initial', 'top_up');--> statement-breakpoint
CREATE TYPE "public"."force_request_status" AS ENUM('sent', 'committed', 'partial', 'declined', 'auto_accepted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."personnel_source" AS ENUM('nominal_roll', 'preference', 'manual');--> statement-breakpoint
CREATE TABLE "force_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"rank_id" uuid NOT NULL,
	"requested" integer NOT NULL,
	"committed" integer,
	"reason" text,
	CONSTRAINT "force_request_lines_counts_ck" CHECK ("force_request_lines"."requested" > 0 and ("force_request_lines"."committed" is null or ("force_request_lines"."committed" >= 0 and "force_request_lines"."committed" <= "force_request_lines"."requested")))
);
--> statement-breakpoint
CREATE TABLE "force_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"round" smallint DEFAULT 1 NOT NULL,
	"kind" "force_request_kind" DEFAULT 'initial' NOT NULL,
	"target_station_id" uuid,
	"target_unit_id" uuid,
	"parent_request_id" uuid,
	"status" "force_request_status" DEFAULT 'sent' NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"note" text,
	"short_reason" text,
	"sent_by" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_by" uuid,
	"responded_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"roll_sent_at" timestamp with time zone,
	CONSTRAINT "force_requests_target_ck" CHECK (("force_requests"."target_station_id" is not null) <> ("force_requests"."target_unit_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "plan_personnel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"request_id" uuid,
	"station_id" uuid NOT NULL,
	"rank_id" uuid NOT NULL,
	"duty_window" "tstzrange" NOT NULL,
	"source" "personnel_source" DEFAULT 'nominal_roll' NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortfall_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"rank_id" uuid NOT NULL,
	"count" integer NOT NULL,
	"reason" text NOT NULL,
	"accepted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortfall_acceptances_count_ck" CHECK ("shortfall_acceptances"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "force_request_lines" ADD CONSTRAINT "force_request_lines_request_id_force_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."force_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "force_request_lines" ADD CONSTRAINT "force_request_lines_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "force_requests" ADD CONSTRAINT "force_requests_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "force_requests" ADD CONSTRAINT "force_requests_target_station_id_stations_id_fk" FOREIGN KEY ("target_station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "force_requests" ADD CONSTRAINT "force_requests_target_unit_id_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "force_requests" ADD CONSTRAINT "force_requests_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "force_requests" ADD CONSTRAINT "force_requests_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_personnel" ADD CONSTRAINT "plan_personnel_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_personnel" ADD CONSTRAINT "plan_personnel_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_personnel" ADD CONSTRAINT "plan_personnel_request_id_force_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."force_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_personnel" ADD CONSTRAINT "plan_personnel_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_personnel" ADD CONSTRAINT "plan_personnel_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_personnel" ADD CONSTRAINT "plan_personnel_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfall_acceptances" ADD CONSTRAINT "shortfall_acceptances_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfall_acceptances" ADD CONSTRAINT "shortfall_acceptances_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortfall_acceptances" ADD CONSTRAINT "shortfall_acceptances_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "force_request_lines_uq" ON "force_request_lines" USING btree ("request_id","rank_id");--> statement-breakpoint
CREATE INDEX "force_requests_plan_idx" ON "force_requests" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "force_requests_station_status_idx" ON "force_requests" USING btree ("target_station_id","status");--> statement-breakpoint
CREATE INDEX "force_requests_deadline_idx" ON "force_requests" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_personnel_plan_person_uq" ON "plan_personnel" USING btree ("plan_id","person_id");--> statement-breakpoint
CREATE INDEX "plan_personnel_request_idx" ON "plan_personnel" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "plan_personnel_person_idx" ON "plan_personnel" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "shortfall_acceptances_plan_idx" ON "shortfall_acceptances" USING btree ("plan_id");--> statement-breakpoint
-- One officer can't be on two bandobasts whose duty windows overlap.
ALTER TABLE "plan_personnel" ADD CONSTRAINT "plan_personnel_no_double_booking" EXCLUDE USING gist ("person_id" WITH =, "duty_window" WITH &&);
