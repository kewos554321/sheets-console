import { z } from "zod";

export const STATUSES = ["planning", "active", "blocked", "done"] as const;
export type ProjectStatus = (typeof STATUSES)[number];

export const BUSINESS_FIELDS = [
  "project_name",
  "client",
  "status",
  "owner",
  "amount",
  "notes",
] as const;
export type BusinessField = (typeof BUSINESS_FIELDS)[number];

export const projectFieldsSchema = z.object({
  project_name: z.string().trim().min(1, "專案名稱為必填").max(80, "專案名稱最多 80 字"),
  client: z.string().trim().min(1, "客戶為必填").max(80, "客戶最多 80 字"),
  status: z.enum(STATUSES),
  owner: z.string().trim().min(1, "負責人為必填").max(40, "負責人最多 40 字"),
  amount: z.number().int("金額必須是整數").min(0, "金額不可為負"),
  notes: z.string().trim().max(500, "備註最多 500 字"),
});
export type ProjectFields = z.infer<typeof projectFieldsSchema>;

export const createRowSchema = projectFieldsSchema;

export const updateRowSchema = projectFieldsSchema.extend({
  version: z.number().int().min(1),
  baseHash: z.string().min(1),
  resolveConflict: z.boolean().optional(),
});
export type UpdateRowInput = z.infer<typeof updateRowSchema>;

export type SheetRow = ProjectFields & {
  _row_id: string;
  _version: number;
  _updated_at: string;
  _updated_by: string;
  _op_id: string;
  _deleted: boolean;
};

export type RowView = SheetRow & {
  content_hash: string;
  stale: boolean;
};

export type AuditAction = "create" | "update" | "resolve_conflict";

export type FieldDiff = {
  field: BusinessField;
  before: unknown;
  after: unknown;
};

export type AuditEvent = {
  id: string;
  rowId: string;
  actorLabel: string;
  source: "ui" | "external";
  action: AuditAction;
  before: ProjectFields | null;
  after: ProjectFields | null;
  diff: FieldDiff[];
  opId: string | null;
  createdAt: string;
};

export type ConflictPayload = {
  error: { code: "VERSION_CONFLICT"; message: string };
  conflict: {
    baseVersion: number;
    baseHash: string;
    mine: ProjectFields;
    current: RowView;
  };
};

export const FIELD_LABELS: Record<BusinessField, string> = {
  project_name: "專案名稱",
  client: "客戶",
  status: "狀態",
  owner: "負責人",
  amount: "金額",
  notes: "備註",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "規劃中",
  active: "進行中",
  blocked: "受阻",
  done: "完成",
};
