import type { AuditEvent, ProjectFields, RowView, UpdateRowInput } from "./schema";

export class RowNotFoundError extends Error {
  constructor(readonly rowId: string) {
    super(`ROW_NOT_FOUND: ${rowId}`);
    this.name = "RowNotFoundError";
  }
}

export class VersionConflictError extends Error {
  constructor(
    readonly baseVersion: number,
    readonly baseHash: string,
    readonly mine: ProjectFields,
    readonly current: RowView,
  ) {
    super("VERSION_CONFLICT");
    this.name = "VersionConflictError";
  }
}

export type WriteResult = {
  row: RowView;
  audit: AuditEvent | null;
};

export interface SheetRepository {
  list(): RowView[];
  get(rowId: string): RowView | undefined;
  create(input: ProjectFields, actorLabel: string, opId: string): WriteResult;
  update(rowId: string, input: UpdateRowInput, actorLabel: string, opId: string): WriteResult;
  simulateExternal(rowId: string): WriteResult;
  audit(rowId: string): AuditEvent[];
  lastSyncedAt(): string | null;
}
