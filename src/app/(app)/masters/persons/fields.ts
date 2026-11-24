import type { FieldDef, Option } from "@/lib/masters/defs";

export const AVAILABILITY: Option[] = [
  { value: "available", label: "Available" },
  { value: "on_leave", label: "On leave" },
  { value: "medical_leave", label: "Medical leave" },
  { value: "suspended", label: "Suspended" },
  { value: "deputation", label: "On deputation" },
  { value: "other", label: "Other duty" },
];
export const FITNESS: Option[] = [
  { value: "fit", label: "Fit for all duties" },
  { value: "light_duty_only", label: "Light duty only" },
];
export const GENDER: Option[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function personFields(ranks: Option[], stations: Option[], lockStation: boolean): FieldDef[] {
  return [
    { name: "name", label: "Officer name", type: "text", required: true, wide: true },
    { name: "genNo", label: "Gen No", type: "text", required: true },
    { name: "rankId", label: "Rank", type: "select", required: true, options: ranks },
    { name: "stationId", label: "Station / office", type: "select", required: true, options: stations, help: lockStation ? "Officers of your station" : undefined },
    { name: "gender", label: "Gender", type: "select", required: true, options: GENDER, defaultValue: "male" },
    { name: "dob", label: "Date of birth", type: "date", required: true, help: "Age is always calculated from this" },
    { name: "phone", label: "Mobile", type: "phone" },
    { name: "availability", label: "Availability", type: "select", required: true, options: AVAILABILITY, defaultValue: "available" },
    { name: "fitness", label: "Fitness", type: "select", required: true, options: FITNESS, defaultValue: "fit", help: "Light-duty officers are never suggested for high-intensity points" },
    { name: "photoUrl", label: "Photo", type: "image" },
    { name: "signatureUrl", label: "Signature", type: "image" },
  ];
}
