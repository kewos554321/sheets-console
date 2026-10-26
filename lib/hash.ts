import { createHash } from "node:crypto";
import { BUSINESS_FIELDS, type ProjectFields } from "./schema";

export function hashFields(fields: ProjectFields): string {
  const canonical = JSON.stringify(BUSINESS_FIELDS.map((field) => fields[field]));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}
