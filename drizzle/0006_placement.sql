CREATE TYPE "public"."assignment_source" AS ENUM('suggested', 'manual', 'preference');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_component_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source" "assignment_source" DEFAULT 'manual' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"diff" jsonb NOT NULL,
	"notified" integer DEFAULT 0 NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_components" ADD COLUMN "placement_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "placement_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "published_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "dropped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_publications" ADD CONSTRAINT "plan_publications_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_publications" ADD CONSTRAINT "plan_publications_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_slot_uq" ON "assignments" USING btree ("slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_plan_person_uq" ON "assignments" USING btree ("plan_id","person_id");--> statement-breakpoint
CREATE INDEX "assignments_component_idx" ON "assignments" USING btree ("plan_component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_publications_version_uq" ON "plan_publications" USING btree ("plan_id","version");