import { buildAuditEvent } from "./audit";
import { diffFields, pickFields } from "./diff";
import { hashFields } from "./hash";
import { RowNotFoundError, VersionConflictError, type SheetRepository, type WriteResult } from "./repository";
import type { AuditEvent, ProjectFields, RowView, SheetRow, UpdateRowInput } from "./schema";
import type { Store } from "./store";

export class FakeSheetRepository implements SheetRepository {
  constructor(private readonly store: Store) {}

  private lastAuditTime(rowId: string, source: "ui" | "external"): string | null {
    let latest: string | null = null;
    for (const event of this.store.audits) {
      if (event.rowId !== rowId || event.source !== source) continue;
      if (!latest || event.createdAt > latest) latest = event.createdAt;
    }
    return latest;
  }

  private toView(row: SheetRow): RowView {
    const lastUi = this.lastAuditTime(row._row_id, "ui");
    const lastExternal = this.lastAuditTime(row._row_id, "external");
    const stale = lastExternal !== null && (lastUi === null || lastExternal > lastUi);
    return { ...row, content_hash: hashFields(row), stale };
  }

  list(): RowView[] {
    return [...this.store.rows.values()].filter((row) => !row._deleted).map((row) => this.toView(row));
  }

  get(rowId: string): RowView | undefined {
    const row = this.store.rows.get(rowId);
    return row ? this.toView(row) : undefined;
  }

  create(input: ProjectFields, actorLabel: string, opId: string): WriteResult {
    const row: SheetRow = {
      ...input,
      _row_id: crypto.randomUUID(),
      _version: 1,
      _updated_at: new Date().toISOString(),
      _updated_by: actorLabel,
      _op_id: opId,
      _deleted: false,
    };
    this.store.rows.set(row._row_id, row);

    const audit = buildAuditEvent({
      rowId: row._row_id,
      actorLabel,
      source: "ui",
      action: "create",
      before: null,
      after: pickFields(input),
      opId,
    });
    this.store.audits.push(audit);

    return { row: this.toView(row), audit };
  }

  update(rowId: string, input: UpdateRowInput, actorLabel: string, opId: string): WriteResult {
    const row = this.store.rows.get(rowId);
    if (!row) throw new RowNotFoundError(rowId);

    const current = this.toView(row);
    const mine = pickFields(input);

    if (input.version !== row._version || input.baseHash !== current.content_hash) {
      throw new VersionConflictError(input.version, input.baseHash, mine, current);
    }

    const before = pickFields(row);
    if (diffFields(before, mine).length === 0) {
      return { row: current, audit: null };
    }

    const next: SheetRow = {
      ...row,
      ...mine,
      _version: row._version + 1,
      _updated_at: new Date().toISOString(),
      _updated_by: actorLabel,
      _op_id: opId,
    };
    this.store.rows.set(rowId, next);

    const audit = buildAuditEvent({
      rowId,
      actorLabel,
      source: "ui",
      action: input.resolveConflict ? "resolve_conflict" : "update",
      before,
      after: mine,
      opId,
    });
    this.store.audits.push(audit);

    return { row: this.toView(next), audit };
  }

  simulateExternal(_rowId: string): WriteResult {
    throw new Error("simulateExternal not implemented");
  }

  audit(rowId: string): AuditEvent[] {
    return this.store.audits.filter((event) => event.rowId === rowId).slice().reverse();
  }

  lastSyncedAt(): string | null {
    let latest: string | null = null;
    for (const row of this.store.rows.values()) {
      if (!latest || row._updated_at > latest) latest = row._updated_at;
    }
    return latest;
  }
}
