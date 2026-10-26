"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { pickFields } from "@/lib/diff";
import {
  STATUSES,
  STATUS_LABELS,
  type ConflictPayload,
  type ProjectFields,
  type ProjectStatus,
  type RowView,
} from "@/lib/schema";
import { DataTable } from "./data-table";
import { ConflictDialog } from "./conflict-dialog";
import { RowFormDialog } from "./row-form-dialog";
import { Button, Input, Select } from "./ui";

type Props = {
  initialRows: RowView[];
  initialLastSyncedAt: string | null;
};

type FormState =
  | { mode: "create" }
  | { mode: "edit"; row: RowView; base: ProjectFields };

type PendingConflict = {
  rowId: string;
  base: ProjectFields;
  mine: ProjectFields;
  conflict: ConflictPayload["conflict"];
};

export function Console({ initialRows, initialLastSyncedAt }: Props) {
  const [rows, setRows] = useState<RowView[]>(initialRows);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialLastSyncedAt);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const [resolving, setResolving] = useState(false);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!needle) return true;
      return [row.project_name, row.client, row.owner].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [rows, query, statusFilter]);

  const selectedRow = rows.find((row) => row._row_id === selectedRowId) ?? null;

  async function refresh() {
    const data = await api.rows();
    setRows(data.rows);
    setLastSyncedAt(data.lastSyncedAt);
  }

  function handleSelectRow(rowId: string) {
    setSelectedRowId(rowId);
    const row = rows.find((item) => item._row_id === rowId);
    if (!row) return;
    setFormError(null);
    setForm({ mode: "edit", row, base: pickFields(row) });
  }

  async function handleSimulateExternal() {    const target = selectedRowId ?? filteredRows[0]?._row_id;
    if (!target) {
      setNotice("目前沒有可修改的列");
      return;
    }

    setSimulating(true);
    try {
      const result = await api.simulateExternal(target);
      await refresh();
      setSelectedRowId(target);
      setNotice(`已模擬外部修改：${result.row.project_name}`);
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "模擬外部修改失敗");
    } finally {
      setSimulating(false);
    }
  }

  async function handleSubmitForm(input: ProjectFields) {
    const activeForm = form;
    if (!activeForm) return;

    setSubmitting(true);
    setFormError(null);
    try {
      if (activeForm.mode === "create") {
        const result = await api.create(input);
        await refresh();
        setForm(null);
        setSelectedRowId(result.row._row_id);
        setNotice("已新增");
      } else {
        const result = await api.update(activeForm.row._row_id, {
          ...input,
          version: activeForm.row._version,
          baseHash: activeForm.row.content_hash,
        });
        await refresh();
        setForm(null);
        setSelectedRowId(result.row._row_id);
        setNotice("已儲存");
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.conflict &&
        activeForm.mode === "edit"
      ) {
        setPendingConflict({
          rowId: activeForm.row._row_id,
          base: activeForm.base,
          mine: input,
          conflict: error.conflict,
        });
        setForm(null);
        setNotice("偵測到衝突，請選擇要保留的版本");
        return;
      }
      setFormError(error instanceof ApiError ? error.message : "儲存失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleKeepMine() {
    const active = pendingConflict;
    if (!active) return;

    setResolving(true);
    try {
      await api.update(active.rowId, {
        ...active.mine,
        version: active.conflict.current._version,
        baseHash: active.conflict.current.content_hash,
        resolveConflict: true,
      });
      await refresh();
      setSelectedRowId(active.rowId);
      setPendingConflict(null);
      setNotice("已保留我的版本");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.conflict) {
        setPendingConflict({ ...active, conflict: error.conflict });
        setNotice("此列又被修改，請重新選擇要保留的版本");
        return;
      }
      setNotice(error instanceof ApiError ? error.message : "解決衝突失敗");
    } finally {
      setResolving(false);
    }
  }

  async function handleKeepSheet() {
    const active = pendingConflict;
    if (!active) return;

    setResolving(true);
    try {
      await refresh();
      setSelectedRowId(active.rowId);
      setPendingConflict(null);
      setNotice("已改用 Sheet 版本");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "重新載入失敗");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sheets Console</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fake Sheets · {rows.length} rows · 最後同步{" "}
            {lastSyncedAt ? formatDateTime(lastSyncedAt) : "—"}
          </p>
        </div>
        <Button variant="ghost" onClick={handleSimulateExternal} disabled={simulating}>
          {simulating ? "模擬中…" : "模擬外部修改"}
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋專案、客戶或負責人"
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "all")}
        >
          <option value="all">全部狀態</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
        <span className="text-sm text-slate-500">顯示 {filteredRows.length} 列</span>
        <Button
          onClick={() => {
            setFormError(null);
            setForm({ mode: "create" });
          }}
        >
          新增
        </Button>
        {notice ? <span className="text-sm text-blue-700">{notice}</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <DataTable rows={filteredRows} selectedRowId={selectedRowId} onSelect={handleSelectRow} />

        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">稽核紀錄</h2>
          {selectedRow ? (
            <p className="mt-2 text-sm text-slate-500">{selectedRow.project_name}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">選取一列查看稽核</p>
          )}
        </aside>
      </div>

      {form ? (
        <RowFormDialog
          title={form.mode === "create" ? "新增專案" : "編輯專案"}
          initial={form.mode === "edit" ? form.base : null}
          initialVersion={form.mode === "edit" ? form.row._version : undefined}
          submitting={submitting}
          serverError={formError}
          onSubmit={handleSubmitForm}
          onClose={() => {
            if (!submitting) setForm(null);
          }}
        />
      ) : null}

      {pendingConflict ? (
        <ConflictDialog
          base={pendingConflict.base}
          mine={pendingConflict.mine}
          conflict={pendingConflict.conflict}
          submitting={resolving}
          onKeepMine={handleKeepMine}
          onKeepSheet={handleKeepSheet}
          onClose={() => {
            if (resolving) return;
            setPendingConflict(null);
            setNotice("已暫緩處理衝突，請重新整理後再編輯");
          }}
        />
      ) : null}
    </div>
  );
}
