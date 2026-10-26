import { diffFields } from "./diff";
import type { AuditAction, AuditEvent, ProjectFields } from "./schema";

export function buildAuditEvent(input: {
  rowId: string;
  actorLabel: string;
  source: "ui" | "external";
  action: AuditAction;
  before: ProjectFields | null;
  after: ProjectFields | null;
  opId: string | null;
}): AuditEvent {
  return {
    id: crypto.randomUUID(),
    rowId: input.rowId,
    actorLabel: input.actorLabel,
    source: input.source,
    action: input.action,
    before: input.before,
    after: input.after,
    diff: diffFields(input.before, input.after),
    opId: input.opId,
    createdAt: new Date().toISOString(),
  };
}
