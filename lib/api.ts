import type { AuditEvent, ConflictPayload, ProjectFields, RowView, UpdateRowInput } from "./schema";

export type RowsResponse = {
  rows: RowView[];
  lastSyncedAt: string | null;
};

export type WriteResponse = {
  row: RowView;
  audit: AuditEvent | null;
};

type ApiErrorBody = {
  error?: { code?: string; message?: string; fields?: Record<string, string[]> };
  conflict?: ConflictPayload["conflict"];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]> | null;
  private readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error?.message ?? `請求失敗（${status}）`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? "UNKNOWN";
    this.fields = body?.error?.fields ?? null;
    this.body = body;
  }

  get conflict(): ConflictPayload["conflict"] | null {
    return this.body?.conflict ?? null;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!response.ok) {
    throw new ApiError(response.status, body as ApiErrorBody | null);
  }
  return body as T;
}

export const api = {
  rows: () => request<RowsResponse>("/api/rows"),
  create: (input: ProjectFields) =>
    request<WriteResponse>("/api/rows", { method: "POST", body: JSON.stringify(input) }),
  update: (rowId: string, input: UpdateRowInput) =>
    request<WriteResponse>(`/api/rows/${encodeURIComponent(rowId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  simulateExternal: (rowId: string) =>
    request<WriteResponse>(`/api/rows/${encodeURIComponent(rowId)}/simulate-external`, { method: "POST" }),
  audit: (rowId: string) =>
    request<{ events: AuditEvent[] }>(`/api/audit?rowId=${encodeURIComponent(rowId)}`),
};
