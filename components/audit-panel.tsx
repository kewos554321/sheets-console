"use client";

import { formatAmount, formatDateTime } from "@/lib/format";
import {
  FIELD_LABELS,
  STATUS_LABELS,
  type AuditEvent,
  type BusinessField,
  type ProjectStatus,
} from "@/lib/schema";
import { Badge } from "./ui";

const ACTION_LABELS = {
  create: "建立",
  update: "更新",
  resolve_conflict: "解決衝突",
} as const;

function displayDiffValue(field: BusinessField, value: unknown): string {
  if (value === null || value === undefined) return "（無）";
  if (field === "amount") return formatAmount(Number(value));
  if (field === "status") return STATUS_LABELS[value as ProjectStatus];
  if (field === "notes" && value === "") return "—";
  return String(value);
}

export function AuditPanel({
  events,
  loading,
  rowLabel,
}: {
  events: AuditEvent[];
  loading: boolean;
  rowLabel: string;
}) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">稽核紀錄 · {rowLabel}</h2>

      {loading ? <p className="mt-3 text-sm text-slate-500">載入中…</p> : null}
      {!loading && events.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">此列尚無稽核紀錄</p>
      ) : null}

      <ol className="mt-3 space-y-4">
        {events.map((event) => (
          <li key={event.id} className="border-l-2 border-slate-200 pl-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={event.source === "external" ? "warn" : "info"}>
                {event.source === "external" ? "Sheet 直接修改" : "UI"}
              </Badge>
              <span className="text-sm font-medium text-slate-800">{ACTION_LABELS[event.action]}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {event.actorLabel} · {formatDateTime(event.createdAt)}
            </p>
            <ul className="mt-1 space-y-0.5">
              {event.diff.map((diff) => (
                <li key={diff.field} className="text-xs text-slate-600">
                  {FIELD_LABELS[diff.field]}：
                  {diff.before === null ? "（新值）" : displayDiffValue(diff.field, diff.before)} →{" "}
                  {displayDiffValue(diff.field, diff.after)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </aside>
  );
}
