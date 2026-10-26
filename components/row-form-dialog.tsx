"use client";

import { useState, type FormEvent } from "react";
import {
  projectFieldsSchema,
  STATUSES,
  STATUS_LABELS,
  type ProjectFields,
  type ProjectStatus,
} from "@/lib/schema";
import { Button, Dialog, Input, Label, Select } from "./ui";

type FormState = {
  project_name: string;
  client: string;
  status: ProjectStatus;
  owner: string;
  amount: string;
  notes: string;
};

function toFormState(initial: ProjectFields | null): FormState {
  if (!initial) {
    return { project_name: "", client: "", status: "planning", owner: "", amount: "", notes: "" };
  }
  return { ...initial, amount: String(initial.amount) };
}

export function RowFormDialog({
  title,
  initial,
  initialVersion,
  submitting,
  serverError,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: ProjectFields | null;
  initialVersion?: number;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (input: ProjectFields) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const rawAmount = form.amount.trim();
    const amount = rawAmount === "" ? Number.NaN : Number(rawAmount);
    if (Number.isNaN(amount)) {
      setErrors({ amount: "金額必須是數字" });
      return;
    }

    const parsed = projectFieldsSchema.safeParse({ ...form, amount });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const nextErrors: Record<string, string> = {};
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages?.[0]) nextErrors[field] = messages[0];
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>專案名稱</Label>
            <Input
              value={form.project_name}
              onChange={(event) => setField("project_name", event.target.value)}
              disabled={submitting}
            />
            {errors.project_name ? <p className="mt-1 text-xs text-red-600">{errors.project_name}</p> : null}
          </div>
          <div>
            <Label>客戶</Label>
            <Input
              value={form.client}
              onChange={(event) => setField("client", event.target.value)}
              disabled={submitting}
            />
            {errors.client ? <p className="mt-1 text-xs text-red-600">{errors.client}</p> : null}
          </div>
          <div>
            <Label>狀態</Label>
            <Select
              value={form.status}
              onChange={(event) => setField("status", event.target.value as ProjectStatus)}
              disabled={submitting}
              className="w-full"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>負責人</Label>
            <Input
              value={form.owner}
              onChange={(event) => setField("owner", event.target.value)}
              disabled={submitting}
            />
            {errors.owner ? <p className="mt-1 text-xs text-red-600">{errors.owner}</p> : null}
          </div>
          <div>
            <Label>金額（TWD）</Label>
            <Input
              value={form.amount}
              onChange={(event) => setField("amount", event.target.value)}
              inputMode="numeric"
              disabled={submitting}
            />
            {errors.amount ? <p className="mt-1 text-xs text-red-600">{errors.amount}</p> : null}
          </div>
          <div>
            <Label>備註</Label>
            <Input
              value={form.notes}
              onChange={(event) => setField("notes", event.target.value)}
              disabled={submitting}
            />
            {errors.notes ? <p className="mt-1 text-xs text-red-600">{errors.notes}</p> : null}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">
            {initialVersion ? `版本 ${initialVersion}` : "建立後版本為 1"}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "處理中…" : initial ? "儲存" : "建立"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
