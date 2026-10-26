import { buildAuditEvent } from "./audit";
import { diffFields, pickFields } from "./diff";
import { hashFields } from "./hash";
import { RowNotFoundError, VersionConflictError, type SheetRepository, type WriteResult } from "./repository";
import type { AuditEvent, ProjectFields, RowView, SheetRow, UpdateRowInput } from "./schema";
import { STATUSES } from "./schema";
import type { Store } from "./store";

export class FakeSheetRepository implements SheetRepository {
  constructor(private readonly store: Store) {}

  private lastAuditSource(rowId: string): "ui" | "external" | null {
    let source: "ui" | "external" | null = null;
    for (const event of this.store.audits) {
      if (event.rowId === rowId) source = event.source;
    }
    return source;
  }

  private toView(row: SheetRow): RowView {
    const stale = this.lastAuditSource(row._row_id) === "external";
    return { ...row, content_hash: hashFields(row), stale };
  }

  async list(): Promise<RowView[]> {
    return [...this.store.rows.values()].filter((row) => !row._deleted).map((row) => this.toView(row));
  }

  async get(rowId: string): Promise<RowView | undefined> {
    const row = this.store.rows.get(rowId);
    return row ? this.toView(row) : undefined;
  }

  async create(input: ProjectFields, actorLabel: string, opId: string): Promise<WriteResult> {
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

  async update(rowId: string, input: UpdateRowInput, actorLabel: string, opId: string): Promise<WriteResult> {
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

  async simulateExternal(rowId: string): Promise<WriteResult> {
    const row = this.store.rows.get(rowId);
    if (!row) throw new RowNotFoundError(rowId);

    const before = pickFields(row);
    const nextStatus = STATUSES[(STATUSES.indexOf(before.status) + 1) % STATUSES.length];
    const notes = `${before.notes}（外部修改）`.slice(0, 500);

    const next: SheetRow = {
      ...row,
      status: nextStatus,
      notes,
      _updated_at: new Date().toISOString(),
      _updated_by: "unknown (Sheet)",
      _op_id: crypto.randomUUID(),
    };
    this.store.rows.set(rowId, next);

    const audit = buildAuditEvent({
      rowId,
      actorLabel: "unknown (Sheet)",
      source: "external",
      action: "update",
      before,
      after: pickFields(next),
      opId: null,
    });
    this.store.audits.push(audit);

    return { row: this.toView(next), audit };
  }

  async audit(rowId: string): Promise<AuditEvent[]> {
    return this.store.audits.filter((event) => event.rowId === rowId).slice().reverse();
  }

  async lastSyncedAt(): Promise<string | null> {
    let latest: string | null = null;
    for (const row of this.store.rows.values()) {
      if (!latest || row._updated_at > latest) latest = row._updated_at;
    }
    return latest;
  }
}
