CREATE TYPE "public"."component_status" AS ENUM('assigned', 'in_progress', 'submitted', 'returned', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'proposing', 'consolidating', 'sourcing', 'placement', 'published', 'live', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."preference_kind" AS ENUM('unit', 'station', 'person');--> statement-breakpoint
CREATE TYPE "public"."preference_status" AS ENUM('active', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."reporting_kind" AS ENUM('reporting', 'briefing', 'deployment', 'relief', 'de_induction');--> statement-breakpoint
CREATE TYPE "public"."slot_role" AS ENUM('member', 'sector_incharge', 'liaison');--> statement-breakpoint
CREATE TABLE "plan_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"component_id" uuid,
	"name" text NOT NULL,
	"co_user_id" uuid,
	"co_person_id" uuid,
	"incharge_person_id" uuid,
	"status" "component_status" DEFAULT 'assigned' NOT NULL,
	"logistics_note" text,
	"return_comment" text,
	"submitted_at" timestamp with time zone,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_equipment_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_component_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	CONSTRAINT "plan_equipment_qty_ck" CHECK ("plan_equipment_requirements"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "plan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_component_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"library_point_id" uuid,
	"name" text NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"priority" smallint DEFAULT 3 NOT NULL,
	"intensity" "intensity" DEFAULT 'medium' NOT NULL,
	"mobility" "mobility" DEFAULT 'static' NOT NULL,
	"gender_req" "gender_req" DEFAULT 'any' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_points_priority_ck" CHECK ("plan_points"."priority" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "plan_reporting_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"kind" "reporting_kind" NOT NULL,
	"rank_id" uuid,
	"at" timestamp with time zone NOT NULL,
	"place" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"label" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "plan_windows_order_ck" CHECK ("plan_windows"."ends_at" > "plan_windows"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"event_type" text DEFAULT 'Festival' NOT NULL,
	"venue" text,
	"description" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"image_url" text,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"proposal_due_at" timestamp with time zone,
	"overall_incharge_person_id" uuid,
	"initiated_by" uuid,
	"reused_from_plan_id" uuid,
	"sent_to_uo_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"point_id" uuid NOT NULL,
	"batch" smallint DEFAULT 1 NOT NULL,
	"rank_id" uuid NOT NULL,
	"count" integer NOT NULL,
	"team_id" uuid,
	"merge_group" text,
	CONSTRAINT "point_requirements_count_ck" CHECK ("point_requirements"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_component_id" uuid NOT NULL,
	"kind" "preference_kind" NOT NULL,
	"unit_id" uuid,
	"station_id" uuid,
	"person_id" uuid,
	"point_id" uuid,
	"rank_id" uuid,
	"count" integer,
	"note" text,
	"status" "preference_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_target_ck" CHECK (("preferences"."kind" = 'unit' and "preferences"."unit_id" is not null) or ("preferences"."kind" = 'station' and "preferences"."station_id" is not null) or ("preferences"."kind" = 'person' and "preferences"."person_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_component_id" uuid NOT NULL,
	"name" text NOT NULL,
	"shift_id" uuid,
	"batches" smallint DEFAULT 1 NOT NULL,
	"instructions" text,
	"image_url" text,
	"incharge_rank_id" uuid,
	"liaison_rank_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sectors_batches_ck" CHECK ("sectors"."batches" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "slot_points" (
	"slot_id" uuid NOT NULL,
	"point_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_component_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"point_id" uuid,
	"batch" smallint DEFAULT 1 NOT NULL,
	"rank_id" uuid NOT NULL,
	"role" "slot_role" DEFAULT 'member' NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"priority" smallint DEFAULT 3 NOT NULL,
	"intensity" "intensity" DEFAULT 'medium' NOT NULL,
	"gender_req" "gender_req" DEFAULT 'any' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_components" ADD CONSTRAINT "plan_components_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_components" ADD CONSTRAINT "plan_components_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_components" ADD CONSTRAINT "plan_components_co_user_id_users_id_fk" FOREIGN KEY ("co_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_components" ADD CONSTRAINT "plan_components_co_person_id_persons_id_fk" FOREIGN KEY ("co_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_components" ADD CONSTRAINT "plan_components_incharge_person_id_persons_id_fk" FOREIGN KEY ("incharge_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_equipment_requirements" ADD CONSTRAINT "plan_equipment_requirements_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_equipment_requirements" ADD CONSTRAINT "plan_equipment_requirements_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_equipment_requirements" ADD CONSTRAINT "plan_equipment_requirements_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_points" ADD CONSTRAINT "plan_points_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_points" ADD CONSTRAINT "plan_points_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_points" ADD CONSTRAINT "plan_points_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_points" ADD CONSTRAINT "plan_points_library_point_id_deployment_points_id_fk" FOREIGN KEY ("library_point_id") REFERENCES "public"."deployment_points"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reporting_schedule" ADD CONSTRAINT "plan_reporting_schedule_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reporting_schedule" ADD CONSTRAINT "plan_reporting_schedule_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_windows" ADD CONSTRAINT "plan_windows_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_overall_incharge_person_id_persons_id_fk" FOREIGN KEY ("overall_incharge_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_requirements" ADD CONSTRAINT "point_requirements_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_requirements" ADD CONSTRAINT "point_requirements_point_id_plan_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."plan_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_requirements" ADD CONSTRAINT "point_requirements_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_requirements" ADD CONSTRAINT "point_requirements_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_point_id_plan_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."plan_points"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_incharge_rank_id_ranks_id_fk" FOREIGN KEY ("incharge_rank_id") REFERENCES "public"."ranks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_liaison_rank_id_ranks_id_fk" FOREIGN KEY ("liaison_rank_id") REFERENCES "public"."ranks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_points" ADD CONSTRAINT "slot_points_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_points" ADD CONSTRAINT "slot_points_point_id_plan_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."plan_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_point_id_plan_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."plan_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_components_plan_name_uq" ON "plan_components" USING btree ("plan_id","name");--> statement-breakpoint
CREATE INDEX "plan_components_co_idx" ON "plan_components" USING btree ("co_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_equipment_uq" ON "plan_equipment_requirements" USING btree ("plan_component_id","equipment_type_id");--> statement-breakpoint
CREATE INDEX "plan_events_plan_idx" ON "plan_events" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_points_sector_idx" ON "plan_points" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "plan_reporting_plan_idx" ON "plan_reporting_schedule" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_windows_plan_idx" ON "plan_windows" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_unit_code_uq" ON "plans" USING btree ("unit_id","code");--> statement-breakpoint
CREATE INDEX "plans_unit_status_idx" ON "plans" USING btree ("unit_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "point_requirements_uq" ON "point_requirements" USING btree ("point_id","batch","rank_id");--> statement-breakpoint
CREATE INDEX "point_requirements_plan_idx" ON "point_requirements" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "preferences_plan_idx" ON "preferences" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "sectors_component_idx" ON "sectors" USING btree ("plan_component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_points_pk" ON "slot_points" USING btree ("slot_id","point_id");--> statement-breakpoint
CREATE INDEX "slots_plan_idx" ON "slots" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "slots_component_idx" ON "slots" USING btree ("plan_component_id");--> statement-breakpoint
CREATE INDEX "slots_sector_idx" ON "slots" USING btree ("sector_id");--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE cascade ON UPDATE no action;