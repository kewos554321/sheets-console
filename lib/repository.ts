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
  list(): Promise<RowView[]>;
  get(rowId: string): Promise<RowView | undefined>;
  create(input: ProjectFields, actorLabel: string, opId: string): Promise<WriteResult>;
  update(rowId: string, input: UpdateRowInput, actorLabel: string, opId: string): Promise<WriteResult>;
  simulateExternal(rowId: string): Promise<WriteResult>;
  audit(rowId: string): Promise<AuditEvent[]>;
  lastSyncedAt(): Promise<string | null>;
}
