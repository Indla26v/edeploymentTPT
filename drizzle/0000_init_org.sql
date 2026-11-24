CREATE TYPE "public"."availability" AS ENUM('available', 'on_leave', 'medical_leave', 'suspended', 'deputation', 'other');--> statement-breakpoint
CREATE TYPE "public"."fitness" AS ENUM('fit', 'light_duty_only');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."rank_category" AS ENUM('general', 'ar', 'apsp');--> statement-breakpoint
CREATE TYPE "public"."station_kind" AS ENUM('police_station', 'office', 'special_unit', 'control_room');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('district', 'commissionerate', 'battalion', 'special');--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"rank_id" uuid NOT NULL,
	"gen_no" text NOT NULL,
	"name" text NOT NULL,
	"gender" "gender" NOT NULL,
	"dob" date NOT NULL,
	"phone" text,
	"photo_url" text,
	"signature_url" text,
	"availability" "availability" DEFAULT 'available' NOT NULL,
	"fitness" "fitness" DEFAULT 'fit' NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" "rank_category" NOT NULL,
	"seniority" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "station_kind" DEFAULT 'police_station' NOT NULL,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"display_order" integer DEFAULT 0 NOT NULL,
	"incharge_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "unit_type" NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"officer_name" text,
	"officer_designation" text,
	"officer_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_rank_id_ranks_id_fk" FOREIGN KEY ("rank_id") REFERENCES "public"."ranks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_incharge_person_id_persons_id_fk" FOREIGN KEY ("incharge_person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "divisions_unit_name_uq" ON "divisions" USING btree ("unit_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_unit_gen_no_uq" ON "persons" USING btree ("unit_id","gen_no");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_phone_uq" ON "persons" USING btree ("phone") WHERE "persons"."phone" is not null;--> statement-breakpoint
CREATE INDEX "persons_station_rank_idx" ON "persons" USING btree ("station_id","rank_id");--> statement-breakpoint
CREATE INDEX "persons_unit_rank_idx" ON "persons" USING btree ("unit_id","rank_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ranks_code_uq" ON "ranks" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_unit_code_uq" ON "stations" USING btree ("unit_id","code");--> statement-breakpoint
CREATE INDEX "stations_division_idx" ON "stations" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_code_uq" ON "units" USING btree ("code");