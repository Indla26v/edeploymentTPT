CREATE TYPE "public"."attendance_event" AS ENUM('check_in', 'check_out');--> statement-breakpoint
CREATE TYPE "public"."attendance_via" AS ENUM('qr', 'manual');--> statement-breakpoint
CREATE TABLE "accommodation_allotments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"accommodation_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"created_by" uuid,
	CONSTRAINT "accommodation_allotments_dates_ck" CHECK ("accommodation_allotments"."to_date" >= "accommodation_allotments"."from_date")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"slot_id" uuid,
	"event" "attendance_event" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"accuracy_m" integer,
	"distance_m" integer,
	"flagged" boolean DEFAULT false NOT NULL,
	"via" "attendance_via" DEFAULT 'qr' NOT NULL,
	"recorded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "equipment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_component_id" uuid,
	"equipment_type_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"issued_at" timestamp with time zone,
	"issued_by" uuid,
	"returned_qty" integer DEFAULT 0 NOT NULL,
	"returned_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_allocations_qty_ck" CHECK ("equipment_allocations"."quantity" > 0 and "equipment_allocations"."returned_qty" >= 0 and "equipment_allocations"."returned_qty" <= "equipment_allocations"."quantity")
);
--> statement-breakpoint
ALTER TABLE "accommodation_allotments" ADD CONSTRAINT "accommodation_allotments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_allotments" ADD CONSTRAINT "accommodation_allotments_accommodation_id_accommodations_id_fk" FOREIGN KEY ("accommodation_id") REFERENCES "public"."accommodations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_allotments" ADD CONSTRAINT "accommodation_allotments_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accommodation_allotments" ADD CONSTRAINT "accommodation_allotments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_plan_component_id_plan_components_id_fk" FOREIGN KEY ("plan_component_id") REFERENCES "public"."plan_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_allocations" ADD CONSTRAINT "equipment_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accommodation_allotments_uq" ON "accommodation_allotments" USING btree ("plan_id","person_id");--> statement-breakpoint
CREATE INDEX "attendance_plan_person_idx" ON "attendance" USING btree ("plan_id","person_id","at");--> statement-breakpoint
CREATE INDEX "equipment_allocations_station_idx" ON "equipment_allocations" USING btree ("station_id","equipment_type_id");