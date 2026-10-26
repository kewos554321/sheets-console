import { BUSINESS_FIELDS, type FieldDiff, type ProjectFields } from "./schema";

export function diffFields(before: ProjectFields | null, after: ProjectFields | null): FieldDiff[] {
  if (!after) return [];
  if (!before) {
    return BUSINESS_FIELDS.map((field) => ({ field, before: null, after: after[field] }));
  }
  return BUSINESS_FIELDS.filter((field) => before[field] !== after[field]).map((field) => ({
    field,
    before: before[field],
    after: after[field],
  }));
}

export function pickFields(row: ProjectFields): ProjectFields {
  return {
    project_name: row.project_name,
    client: row.client,
    status: row.status,
    owner: row.owner,
    amount: row.amount,
    notes: row.notes,
  };
}
