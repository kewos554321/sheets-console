"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { STATUSES, STATUS_LABELS, type ProjectStatus, type RowView } from "@/lib/schema";
import { DataTable } from "./data-table";
import { Button, Input, Select } from "./ui";

type Props = {
  initialRows: RowView[];
  initialLastSyncedAt: string | null;
};

export function Console({ initialRows, initialLastSyncedAt }: Props) {
  const [rows, setRows] = useState<RowView[]>(initialRows);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialLastSyncedAt);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

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

  async function handleSimulateExternal() {
    const target = selectedRowId ?? filteredRows[0]?._row_id;
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
        {notice ? <span className="text-sm text-blue-700">{notice}</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <DataTable rows={filteredRows} selectedRowId={selectedRowId} onSelect={setSelectedRowId} />

        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">稽核紀錄</h2>
          {selectedRow ? (
            <p className="mt-2 text-sm text-slate-500">{selectedRow.project_name}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">選取一列查看稽核</p>
          )}
        </aside>
      </div>
    </div>
  );
}
