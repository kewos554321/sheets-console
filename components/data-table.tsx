"use client";

import { flexRender, type SortingState } from "@tanstack/react-table";
import {
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import { useEffect, useState } from "react";
import { formatAmount, formatDateTime } from "@/lib/format";
import { STATUS_LABELS, type RowView } from "@/lib/schema";
import { Badge, Button } from "./ui";

const STATUS_TONES = {
  planning: "neutral",
  active: "info",
  blocked: "warn",
  done: "success",
} as const;

const columns: LegacyColumnDef<RowView>[] = [
  {
    accessorKey: "project_name",
    header: "專案名稱",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-900">{row.original.project_name}</span>
        {row.original.stale ? <Badge tone="warn">外部變更</Badge> : null}
      </div>
    ),
  },
  { accessorKey: "client", header: "客戶" },
  {
    accessorKey: "status",
    header: "狀態",
    cell: ({ row }) => (
      <Badge tone={STATUS_TONES[row.original.status]}>{STATUS_LABELS[row.original.status]}</Badge>
    ),
  },
  { accessorKey: "owner", header: "負責人" },
  {
    accessorKey: "amount",
    header: "金額",
    cell: ({ row }) => <span className="tabular-nums">{formatAmount(row.original.amount)}</span>,
  },
  {
    accessorKey: "_updated_at",
    header: "更新時間",
    cell: ({ row }) => (
      <span className="text-xs text-slate-500">{formatDateTime(row.original._updated_at)}</span>
    ),
  },
];

export function DataTable({
  rows,
  selectedRowId,
  onSelect,
}: {
  rows: RowView[];
  selectedRowId: string | null;
  onSelect: (rowId: string) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "_updated_at", desc: true }]);

  const table = useLegacyTable<RowView>({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });

  useEffect(() => {
    table.setPageIndex(0);
  }, [rows, table]);

  const pagination = table.getState().pagination;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none px-4 py-3 font-medium hover:text-slate-800"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " ↑" : null}
                    {header.column.getIsSorted() === "desc" ? " ↓" : null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.original._row_id}
                onClick={() => onSelect(row.original._row_id)}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                  row.original._row_id === selectedRowId ? "bg-blue-50 hover:bg-blue-50" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  沒有符合條件的資料
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
        <span>共 {rows.length} 列</span>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            上一頁
          </Button>
          <span className="tabular-nums">
            {pagination.pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
          </span>
          <Button variant="ghost" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            下一頁
          </Button>
        </div>
      </div>
    </div>
  );
}
