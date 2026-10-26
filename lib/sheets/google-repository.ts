import { buildAuditEvent } from "../audit";
import { diffFields, pickFields } from "../diff";
import { hashFields } from "../hash";
import {
  RowNotFoundError,
  VersionConflictError,
  type SheetRepository,
  type WriteResult,
} from "../repository";
import {
  STATUSES,
  type AuditEvent,
  type ProjectFields,
  type RowView,
  type SheetRow,
  type UpdateRowInput,
} from "../schema";
import type { SheetsGateway } from "./gateway";
import {
  diffToCellUpdates,
  matrixToRows,
  metaCellUpdates,
  parseHeaders,
  rowToArrayInHeaderOrder,
} from "./mapping";

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class GoogleSheetRepository implements SheetRepository {
  private readonly audits: AuditEvent[] = [];
  private readonly mutex = new Mutex();

  constructor(private readonly gateway: SheetsGateway) {}

  private async load(): Promise<{ rows: SheetRow[]; headers: string[] }> {
    const matrix = await this.gateway.readAll();
    const { headers } = parseHeaders(matrix);
    return { rows: matrixToRows(matrix), headers };
  }

  private lastAuditSource(rowId: string): "ui" | "external" | null {
    let source: "ui" | "external" | null = null;
    for (const event of this.audits) {
      if (event.rowId === rowId) source = event.source;
    }
    return source;
  }

  private toView(row: SheetRow): RowView {
    return {
      ...row,
      content_hash: hashFields(row),
      stale: this.lastAuditSource(row._row_id) === "external",
    };
  }

  async list(): Promise<RowView[]> {
    const { rows } = await this.load();
    return rows.filter((row) => !row._deleted).map((row) => this.toView(row));
  }

  async get(rowId: string): Promise<RowView | undefined> {
    const { rows } = await this.load();
    const row = rows.find((candidate) => candidate._row_id === rowId);
    return row ? this.toView(row) : undefined;
  }

  async create(input: ProjectFields, actorLabel: string, opId: string): Promise<WriteResult> {
    return this.mutex.runExclusive(async () => {
      const { headers } = await this.load();

      const row: SheetRow = {
        ...input,
        _row_id: crypto.randomUUID(),
        _version: 1,
        _updated_at: new Date().toISOString(),
        _updated_by: actorLabel,
        _op_id: opId,
        _deleted: false,
      };

      await this.gateway.appendRow(rowToArrayInHeaderOrder(row, headers));

      const audit = buildAuditEvent({
        rowId: row._row_id,
        actorLabel,
        source: "ui",
        action: "create",
        before: null,
        after: pickFields(input),
        opId,
      });
      this.audits.push(audit);

      return { row: this.toView(row), audit };
    });
  }

  async update(
    rowId: string,
    input: UpdateRowInput,
    actorLabel: string,
    opId: string,
  ): Promise<WriteResult> {
    return this.mutex.runExclusive(async () => {
      const { rows, headers } = await this.load();
      const index = rows.findIndex((candidate) => candidate._row_id === rowId);
      if (index === -1) throw new RowNotFoundError(rowId);

      const row = rows[index];
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

      const rowNumber = index + 2;
      await this.gateway.updateCells([
        ...diffToCellUpdates(rowNumber, headers, before, mine),
        ...metaCellUpdates(rowNumber, headers, next),
      ]);

      const audit = buildAuditEvent({
        rowId,
        actorLabel,
        source: "ui",
        action: input.resolveConflict ? "resolve_conflict" : "update",
        before,
        after: mine,
        opId,
      });
      this.audits.push(audit);

      return { row: this.toView(next), audit };
    });
  }

  async simulateExternal(rowId: string): Promise<WriteResult> {
    return this.mutex.runExclusive(async () => {
      const { rows, headers } = await this.load();
      const index = rows.findIndex((candidate) => candidate._row_id === rowId);
      if (index === -1) throw new RowNotFoundError(rowId);

      const row = rows[index];
      const before = pickFields(row);
      const nextStatus = STATUSES[(STATUSES.indexOf(before.status) + 1) % STATUSES.length];
      const next: SheetRow = {
        ...row,
        status: nextStatus,
        notes: `${before.notes}（外部修改）`.slice(0, 500),
        _updated_at: new Date().toISOString(),
        _updated_by: "unknown (Sheet)",
        _op_id: crypto.randomUUID(),
      };

      const rowNumber = index + 2;
      await this.gateway.updateCells([
        ...diffToCellUpdates(rowNumber, headers, before, pickFields(next)),
        ...metaCellUpdates(rowNumber, headers, next),
      ]);

      const audit = buildAuditEvent({
        rowId,
        actorLabel: "unknown (Sheet)",
        source: "external",
        action: "update",
        before,
        after: pickFields(next),
        opId: next._op_id,
      });
      this.audits.push(audit);

      return { row: this.toView(next), audit };
    });
  }

  async audit(rowId: string): Promise<AuditEvent[]> {
    return this.audits.filter((event) => event.rowId === rowId).slice().reverse();
  }

  async lastSyncedAt(): Promise<string | null> {
    const rows = await this.list();
    return rows.reduce<string | null>(
      (latest, row) => (!latest || row._updated_at > latest ? row._updated_at : latest),
      null,
    );
  }
}
