import type { FieldDef } from "@/lib/masters/defs";

export const unitProfileFields: FieldDef[] = [
  { name: "officerName", label: "Unit Officer name", type: "text", required: true },
  { name: "officerDesignation", label: "Designation", type: "text", required: true, placeholder: "Superintendent of Police" },
  { name: "officerPhone", label: "Mobile", type: "phone" },
  { name: "about", label: "About the unit", type: "textarea", wide: true, help: "Shown on the scheme book cover." },
  { name: "logoUrl", label: "Unit logo", type: "image", help: "Printed on ID cards, duty passes and the scheme book." },
  { name: "signatureUrl", label: "Unit Officer signature", type: "image", help: "Printed on ID cards and duty passes." },
  { name: "profileImageUrl", label: "Profile image", type: "image" },
];
