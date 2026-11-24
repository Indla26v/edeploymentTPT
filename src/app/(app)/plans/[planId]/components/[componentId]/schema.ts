import { z } from "zod";

const uuidOrNull = z.string().uuid().nullable();

export const requirementSchema = z.object({
  batch: z.number().int().min(1).max(4),
  rankId: z.string().uuid(),
  count: z.number().int().min(0).max(5000),
  teamId: uuidOrNull.optional().default(null),
  mergeGroup: z
    .string()
    .trim()
    .max(12)
    .nullable()
    .optional()
    .transform((v) => v || null),
});

export const pointSchema = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(2, "Enter the point name").max(120),
  libraryPointId: uuidOrNull,
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  priority: z.number().int().min(1).max(4),
  intensity: z.enum(["high", "medium", "low"]),
  mobility: z.enum(["static", "mobile"]),
  genderReq: z.enum(["any", "male", "female"]),
  requirements: z.array(requirementSchema).max(200),
});

export const sectorSchema = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(2, "Enter the sector name").max(80),
  shiftId: uuidOrNull,
  batches: z.number().int().min(1).max(4),
  instructions: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .transform((v) => v || null),
  imageUrl: z.string().max(500).nullable(),
  inchargeRankId: uuidOrNull,
  liaisonRankId: uuidOrNull,
  points: z.array(pointSchema).max(200),
});

export const preferenceSchema = z
  .object({
    kind: z.enum(["unit", "station", "person"]),
    unitId: uuidOrNull,
    stationId: uuidOrNull,
    personId: uuidOrNull,
    pointKey: z.string().nullable(),
    rankId: uuidOrNull,
    count: z.number().int().min(1).max(5000).nullable(),
    note: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .transform((v) => v || null),
  })
  .refine((p) => (p.kind === "unit" ? !!p.unitId : p.kind === "station" ? !!p.stationId : !!p.personId), { message: "Choose who is preferred" });

export const proposalSchema = z.object({
  sectors: z.array(sectorSchema).max(100),
  logisticsNote: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .transform((v) => v || null),
  equipment: z.array(z.object({ equipmentTypeId: z.string().uuid(), quantity: z.number().int().min(1).max(100000), note: z.string().trim().max(200).nullable() })).max(50),
  preferences: z.array(preferenceSchema).max(300),
});

export type ProposalInput = z.input<typeof proposalSchema>;
export type SectorInput = z.input<typeof sectorSchema>;
export type PointInput = z.input<typeof pointSchema>;
export type PreferenceInput = z.input<typeof preferenceSchema>;
