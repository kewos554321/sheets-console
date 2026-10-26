"use client";

import { formatAmount } from "@/lib/format";
import {
  BUSINESS_FIELDS,
  FIELD_LABELS,
  STATUS_LABELS,
  type ConflictPayload,
  type ProjectFields,
  type ProjectStatus,
} from "@/lib/schema";
import { Button, Dialog } from "./ui";

function displayValue(field: (typeof BUSINESS_FIELDS)[number], value: unknown): string {
  if (field === "status") return STATUS_LABELS[value as ProjectStatus];
  if (field === "amount") return formatAmount(Number(value));
  if (field === "notes" && !value) return "—";
  return String(value ?? "");
}

export function ConflictDialog({
  base,
  mine,
  conflict,
  submitting,
  onKeepMine,
  onKeepSheet,
  onClose,
}: {
  base: ProjectFields;
  mine: ProjectFields;
  conflict: ConflictPayload["conflict"];
  submitting: boolean;
  onKeepMine: () => void;
  onKeepSheet: () => void;
  onClose: () => void;
}) {
  const current = conflict.current;
  const changed = BUSINESS_FIELDS.filter(
    (field) => base[field] !== mine[field] || mine[field] !== current[field] || base[field] !== current[field],
  );
  const shown = changed.length > 0 ? changed : BUSINESS_FIELDS;

  return (
    <Dialog title="版本衝突" onClose={onClose}>
      <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        這一列在你編輯期間被修改。系統不會自動合併，請選擇要保留的版本。
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">欄位</th>
              <th className="px-3 py-2 font-medium">基準版本（v{conflict.baseVersion}）</th>
              <th className="px-3 py-2 font-medium">我的版本</th>
              <th className="px-3 py-2 font-medium">Sheet 目前（v{current._version}）</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((field) => {
              const differs = mine[field] !== current[field];
              return (
                <tr key={field} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-700">{FIELD_LABELS[field]}</td>
                  <td className="px-3 py-2 text-slate-500">{displayValue(field, base[field])}</td>
                  <td className={`px-3 py-2 ${differs ? "bg-amber-50 text-amber-900" : ""}`}>
                    {displayValue(field, mine[field])}
                  </td>
                  <td className={`px-3 py-2 ${differs ? "bg-amber-50 text-amber-900" : ""}`}>
                    {displayValue(field, current[field])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="ghost" onClick={onKeepSheet} disabled={submitting}>
          保留 Sheet
        </Button>
        <Button onClick={onKeepMine} disabled={submitting}>
          {submitting ? "處理中…" : "保留我的"}
        </Button>
      </div>
    </Dialog>
  );
}
