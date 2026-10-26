# Sheets Console 最小 POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在空 repo 建一個可點擊的 Next.js POC，用 in-memory fake repository 驗證「結構化寫入 + `_version`/hash 樂觀鎖 + 409 衝突 + 稽核 + 外部修改」主線。

**Architecture:** Next.js App Router。Server 端由 Route Handlers 呼叫 `SheetRepository`（介面）的 `FakeSheetRepository` 實作，資料存在 `globalThis` singleton。Client 只透過 `/api/*` 讀寫；衝突以 `_version` 與 content hash 雙重比對攔截。

**Tech Stack:** Next.js (App Router)、React 19、TypeScript strict、Tailwind CSS v4、TanStack Table、zod、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-26-sheets-console-poc-design.md`

## Global Constraints

- TypeScript strict，禁用 `any`；不得用 `@ts-ignore`。
- Runtime 依賴僅限：`next`、`react`、`react-dom`、`zod`、`@tanstack/react-table`。
- Dev 依賴僅限：`typescript`、`@types/node`、`@types/react`、`@types/react-dom`、`tailwindcss`、`@tailwindcss/postcss`、`vitest`。
- 不得引入環境變數、資料庫、登入、Google API 或任何外部網路呼叫；client 只能打同源 `/api/*`。
- UI 文案繁體中文；時間存 UTC ISO 8601，顯示用 `Asia/Taipei`。
- 固定身分：UI 寫入 `demo@example.com`；外部修改 `unknown (Sheet)`。
- 種子資料恰好 1000 列，`_row_id` 決定性（重啟不變）。
- 金額為 TWD 整數且 ≥ 0；`project_name`/`client` ≤ 80 字；`owner` ≤ 40 字；`notes` ≤ 500 字。
- 每個成功寫入回應都含 `row`（`RowView`）與 `audit`（可能為 `null`）。
- 每個 task 結束都要跑 `npm test` 與 `npm run typecheck`，並 commit。

## Review Focus

以下五類輸入／情境沒有寫在 spec 的表格裡，但最可能讓使用者踩雷；每條都由指定 task 的測試釘住。

1. 金額輸入 `"12,000"`、`"12.5"`、空白、`NaN` → 表單必須顯示錯誤並阻擋，不得存成 `0` 或 `NaN`。（Task 2 + Task 9）
2. 外部修改動了 A 欄，使用者只改 B 欄 → 仍須 409，不可默默蓋掉 A。（Task 5）
3. 送出完全沒變更的表單 → 200，但不得新增稽核或遞增版本。（Task 5）
4. 兩個分頁先後編輯同一列 → 後送出者必定 409，不可兩次都成功。（Task 5）
5. 重整頁面或改變排序 → 選取列以 `_row_id` 識別，`_row_id` 與種子資料穩定，不得因索引位移而選錯列。（Task 4 + Task 8）

---

### Task 1: 專案骨架與測試環境

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`（暫用 placeholder）
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `npm run dev`、`npm run build`、`npm test`、`npm run typecheck` 可用；`@/*`  alias 指向 repo 根目錄。

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "sheets-console",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 安裝依賴**

Run:
```bash
npm install next react react-dom zod @tanstack/react-table
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss vitest
```
Expected: `node_modules/` 建立，`package.json` 出現 dependencies 與 devDependencies。

- [ ] **Step 3: 建立設定檔**

`tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`：
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`postcss.config.mjs`：
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`vitest.config.ts`：
```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: 建立 App 骨架**

`app/globals.css`：
```css
@import "tailwindcss";

body {
  background: #f6f7f9;
  color: #16181d;
}
```

`app/layout.tsx`：
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "Sheets Console POC" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
```

`app/page.tsx`（Task 8 會替換）：
```tsx
export default function Page() {
  return <main className="p-8">Sheets Console POC</main>;
}
```

- [ ] **Step 5: 寫 smoke test**

`tests/smoke.test.ts`：
```ts
import { describe, expect, it } from "vitest";

describe("測試環境", () => {
  it("可以執行 TypeScript 測試", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 驗證**

Run: `npm test`
Expected: 1 passed。

Run: `npm run typecheck`
Expected: 無錯誤。

Run: `npm run build`
Expected: build 成功，列出 `/` 路由。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts app tests
git commit -m "chore: scaffold Next.js app with vitest"
```

---

### Task 2: 共用 schema、標籤與 content hash

**Files:**
- Create: `lib/schema.ts`, `lib/hash.ts`
- Test: `tests/schema.test.ts`, `tests/hash.test.ts`

**Interfaces:**
- Consumes: 無
- Produces（後續 task 依賴）:
  - `STATUSES: readonly ["planning","active","blocked","done"]`
  - `BUSINESS_FIELDS: readonly ["project_name","client","status","owner","amount","notes"]`
  - `projectFieldsSchema`、`type ProjectFields`
  - `createRowSchema`（= `projectFieldsSchema`）
  - `updateRowSchema`（`projectFieldsSchema` + `version:number` + `baseHash:string` + `resolveConflict?:boolean`）
  - `type SheetRow`、`type RowView = SheetRow & { content_hash: string; stale: boolean }`
  - `type FieldDiff`、`type AuditEvent`、`type ConflictPayload`
  - `FIELD_LABELS: Record<BusinessField, string>`、`STATUS_LABELS: Record<ProjectStatus, string>`
  - `hashFields(fields: ProjectFields): string`（格式 `sha256:<64 hex>`）

- [ ] **Step 1: 寫失敗測試**

`tests/schema.test.ts`：
```ts
import { describe, expect, it } from "vitest";
import { projectFieldsSchema, updateRowSchema } from "@/lib/schema";

const valid = {
  project_name: "官網改版",
  client: "Acme",
  status: "active" as const,
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

describe("projectFieldsSchema", () => {
  it("接受合法輸入", () => {
    expect(projectFieldsSchema.safeParse(valid).success).toBe(true);
  });

  it("拒絕空白或超長名稱", () => {
    expect(projectFieldsSchema.safeParse({ ...valid, project_name: "   " }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, project_name: "x".repeat(81) }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, client: "" }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, owner: "x".repeat(41) }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, notes: "x".repeat(501) }).success).toBe(false);
  });

  it("拒絕非整數、負數、字串與 NaN 金額", () => {
    expect(projectFieldsSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: 12.5 }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: Number("12,000") }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: "12000" }).success).toBe(false);
    expect(projectFieldsSchema.safeParse({ ...valid, amount: Number.NaN }).success).toBe(false);
  });

  it("拒絕未知狀態", () => {
    expect(projectFieldsSchema.safeParse({ ...valid, status: "archived" }).success).toBe(false);
  });
});

describe("updateRowSchema", () => {
  it("要求 version 與 baseHash", () => {
    expect(updateRowSchema.safeParse(valid).success).toBe(false);
    expect(updateRowSchema.safeParse({ ...valid, version: 1, baseHash: "sha256:abc" }).success).toBe(true);
  });
});
```

`tests/hash.test.ts`：
```ts
import { describe, expect, it } from "vitest";
import { hashFields } from "@/lib/hash";

const fields = {
  project_name: "官網改版",
  client: "Acme",
  status: "active" as const,
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

describe("hashFields", () => {
  it("相同內容得到相同 hash", () => {
    expect(hashFields(fields)).toBe(hashFields({ ...fields }));
  });

  it("任一欄位改變就改變 hash", () => {
    expect(hashFields(fields)).not.toBe(hashFields({ ...fields, notes: "改" }));
    expect(hashFields(fields)).not.toBe(hashFields({ ...fields, amount: 1 }));
  });

  it("輸出為 sha256: 加 64 位小寫 hex", () => {
    expect(hashFields(fields)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/schema.test.ts tests/hash.test.ts`
Expected: FAIL，找不到 `@/lib/schema` 與 `@/lib/hash`。

- [ ] **Step 3: 實作 `lib/schema.ts`**

重點：
- `amount` 用 `z.number().int("金額必須是整數").min(0, "金額不可為負")`；不要加 `catch` 或 coercion，讓字串與 `NaN` 直接失敗。
- 所有字串加 `.trim()`；`notes` 允許空字串（不使用 `.default`）。
- `updateRowSchema = projectFieldsSchema.extend({ version: z.number().int().min(1), baseHash: z.string().min(1), resolveConflict: z.boolean().optional() })`。
- `FieldDiff` 為 `{ field: BusinessField; before: unknown; after: unknown }`。
- `AuditEvent` 依 spec §4.3；`ConflictPayload` 依 spec §5.1，其中 `current: RowView`。
- 標籤：`planning`→規劃中、`active`→進行中、`blocked`→受阻、`done`→完成；欄位中文標籤為「專案名稱／客戶／狀態／負責人／金額／備註」。

- [ ] **Step 4: 實作 `lib/hash.ts`**

```ts
import { createHash } from "node:crypto";
import { BUSINESS_FIELDS, type ProjectFields } from "./schema";

export function hashFields(fields: ProjectFields): string {
  const canonical = JSON.stringify(BUSINESS_FIELDS.map((field) => fields[field]));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -- tests/schema.test.ts tests/hash.test.ts`
Expected: 全部 passed。

- [ ] **Step 6: Commit**

```bash
git add lib/schema.ts lib/hash.ts tests/schema.test.ts tests/hash.test.ts
git commit -m "feat: add shared zod schema and content hash"
```

---

### Task 3: 欄位 diff 與稽核事件組裝

**Files:**
- Create: `lib/diff.ts`, `lib/audit.ts`
- Test: `tests/diff.test.ts`

**Interfaces:**
- Consumes: `BUSINESS_FIELDS`、`FieldDiff`、`ProjectFields`、`AuditAction`、`AuditEvent` from `@/lib/schema`
- Produces:
  - `diffFields(before: ProjectFields | null, after: ProjectFields | null): FieldDiff[]`
  - `pickFields(row: ProjectFields): ProjectFields`
  - `buildAuditEvent(input: { rowId: string; actorLabel: string; source: "ui" | "external"; action: AuditAction; before: ProjectFields | null; after: ProjectFields | null; opId: string | null }): AuditEvent`

- [ ] **Step 1: 寫失敗測試**

`tests/diff.test.ts`：
```ts
import { describe, expect, it } from "vitest";
import { buildAuditEvent } from "@/lib/audit";
import { diffFields } from "@/lib/diff";
import type { ProjectFields } from "@/lib/schema";

const before: ProjectFields = {
  project_name: "官網改版",
  client: "Acme",
  status: "active",
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

describe("diffFields", () => {
  it("只回傳變更欄位的前後值", () => {
    const diff = diffFields(before, { ...before, status: "done", amount: 150000 });
    expect(diff).toEqual([
      { field: "status", before: "active", after: "done" },
      { field: "amount", before: 120000, after: 150000 },
    ]);
  });

  it("before 為 null 時列出全部業務欄位", () => {
    expect(diffFields(null, before)).toHaveLength(6);
    expect(diffFields(null, before)[0]).toEqual({ field: "project_name", before: null, after: "官網改版" });
  });

  it("無變更回傳空陣列", () => {
    expect(diffFields(before, { ...before })).toEqual([]);
  });
});

describe("buildAuditEvent", () => {
  it("帶入來源、actor、diff 與 ISO 時間", () => {
    const event = buildAuditEvent({
      rowId: "row-1",
      actorLabel: "demo@example.com",
      source: "ui",
      action: "update",
      before,
      after: { ...before, status: "done" },
      opId: "op-1",
    });

    expect(event.rowId).toBe("row-1");
    expect(event.diff).toEqual([{ field: "status", before: "active", after: "done" }]);
    expect(new Date(event.createdAt).toISOString()).toBe(event.createdAt);
    expect(event.opId).toBe("op-1");
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/diff.test.ts`
Expected: FAIL，找不到 `@/lib/diff` 與 `@/lib/audit`。

- [ ] **Step 3: 實作 `lib/diff.ts`**

- `diffFields` 依 `BUSINESS_FIELDS` 順序比較，使用 `!==`；`after === null` 回傳 `[]`（POC 無刪除）。
- `pickFields(row)` 只回傳六個業務欄位，避免把 `_version` 等中繼欄位寫進稽核。

- [ ] **Step 4: 實作 `lib/audit.ts`**

`buildAuditEvent` 產生 `id: crypto.randomUUID()`、`createdAt: new Date().toISOString()`、`diff: diffFields(input.before, input.after)`，其餘欄位原樣帶入。

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -- tests/diff.test.ts`
Expected: 全部 passed。

- [ ] **Step 6: Commit**

```bash
git add lib/diff.ts lib/audit.ts tests/diff.test.ts
git commit -m "feat: add field diff and audit event builder"
```

---

### Task 4: 種子資料、store 與 repository 讀取/建立

**Files:**
- Create: `lib/seed.ts`, `lib/store.ts`, `lib/repository.ts`, `lib/fake-repository.ts`
- Test: `tests/repository.test.ts`

**Interfaces:**
- Consumes: `hashFields`、`buildAuditEvent`、`pickFields`、schema 型別
- Produces:
  - `generateSeedRows(count?: number): SheetRow[]`
  - `seedRowId(index: number): string`
  - `type Store = { rows: Map<string, SheetRow>; audits: AuditEvent[] }`
  - `getStore(): Store`、`resetStore(): void`
  - `class RowNotFoundError extends Error { rowId: string }`
  - `class VersionConflictError extends Error { baseVersion: number; baseHash: string; mine: ProjectFields; current: RowView }`
  - `type WriteResult = { row: RowView; audit: AuditEvent | null }`
  - `interface SheetRepository` 依下方簽名
  - `class FakeSheetRepository implements SheetRepository`，建構子 `(store: Store)`

```ts
export interface SheetRepository {
  list(): RowView[];
  get(rowId: string): RowView | undefined;
  create(input: ProjectFields, actorLabel: string, opId: string): WriteResult;
  update(rowId: string, input: UpdateRowInput, actorLabel: string, opId: string): WriteResult;
  simulateExternal(rowId: string): WriteResult;
  audit(rowId: string): AuditEvent[];
  lastSyncedAt(): string | null;
}
```

- [ ] **Step 1: 寫失敗測試（本 task 的範圍）**

`tests/repository.test.ts`：
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { FakeSheetRepository } from "@/lib/fake-repository";
import { generateSeedRows, seedRowId } from "@/lib/seed";
import { getStore, resetStore } from "@/lib/store";

const input = {
  project_name: "官網改版",
  client: "Acme",
  status: "active" as const,
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

let repo: FakeSheetRepository;

beforeEach(() => {
  resetStore();
  repo = new FakeSheetRepository(getStore());
});

describe("種子資料", () => {
  it("產生 1000 列且 _row_id 決定性、唯一", () => {
    const rows = generateSeedRows(1000);
    expect(rows).toHaveLength(1000);
    expect(new Set(rows.map((row) => row._row_id)).size).toBe(1000);
    expect(rows[0]._row_id).toBe(seedRowId(1));
    expect(generateSeedRows(3).map((row) => row._row_id)).toEqual(generateSeedRows(3).map((row) => row._row_id));
    expect(rows.every((row) => row._version === 1 && row._deleted === false)).toBe(true);
  });

  it("resetStore 會重建 1000 列", () => {
    expect(getStore().rows.size).toBe(1000);
    getStore().rows.clear();
    resetStore();
    expect(getStore().rows.size).toBe(1000);
  });
});

describe("list / get / create", () => {
  it("list 回傳 1000 列並附 content_hash 與 stale", () => {
    const rows = repo.list();
    expect(rows).toHaveLength(1000);
    expect(rows[0].content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(rows[0].stale).toBe(false);
  });

  it("get 找不到回傳 undefined", () => {
    expect(repo.get("missing")).toBeUndefined();
  });

  it("create 產生 version 1、稽核與可查到的列", () => {
    const result = repo.create(input, "demo@example.com", "op-1");
    expect(result.row._version).toBe(1);
    expect(result.row._row_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.audit?.action).toBe("create");
    expect(result.audit?.diff).toHaveLength(6);
    expect(repo.list()).toHaveLength(1001);
    expect(repo.get(result.row._row_id)?.project_name).toBe("官網改版");
  });

  it("lastSyncedAt 回傳最新 _updated_at", () => {
    const latest = repo.list().map((row) => row._updated_at).sort().at(-1);
    expect(repo.lastSyncedAt()).toBe(latest);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/repository.test.ts`
Expected: FAIL，找不到 `@/lib/fake-repository`、`@/lib/seed`、`@/lib/store`。

- [ ] **Step 3: 實作 `lib/seed.ts`**

- `seedRowId(n)` 回傳 `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`。
- `generateSeedRows(count = 1000)` 以索引產生決定性資料：專案名稱 `專案 001`…、客戶與負責人取自固定陣列、狀態輪替四種、金額 `10000 + i * 500`、備註每三筆一則、`_version: 1`、`_updated_at` 從 `Date.UTC(2026, 0, 1)` 起每列 +1 分鐘、`_updated_by: "demo@example.com"`、`_op_id: "seed"`、`_deleted: false`。
- 不得使用 `Math.random()` 或 `Date.now()`。

- [ ] **Step 4: 實作 `lib/store.ts`**

用 `declare global { var __sheetsConsoleStore: Store | undefined }` 保存 singleton；`getStore()` 首次呼叫時以 `generateSeedRows(1000)` 建 `Map`；`resetStore()` 重新建立。`audits` 初始為空陣列。

- [ ] **Step 5: 實作 `lib/repository.ts` 與 `lib/fake-repository.ts`（讀取與建立）**

- `toView(row)`：`{ ...row, content_hash: hashFields(row), stale }`；`stale` 的判定：取該列最後一筆 external 稽核與最後一筆 ui 稽核的 `createdAt`，external 較新（或沒有 ui 稽核）即 `true`。
- `list()` 過濾 `_deleted`；`get()` 回 `RowView | undefined`；`lastSyncedAt()` 取所有列 `_updated_at` 最大值，空集合回 `null`。
- `create()`：`_row_id: crypto.randomUUID()`、`_version: 1`、`_updated_at: new Date().toISOString()`、`_updated_by: actorLabel`、`_op_id: opId`、`_deleted: false`；push 一筆 `action: "create"`、`before: null`、`after: pickFields(input)` 的稽核。

- [ ] **Step 6: 執行測試確認通過**

Run: `npm test -- tests/repository.test.ts`
Expected: 全部 passed。

- [ ] **Step 7: Commit**

```bash
git add lib/seed.ts lib/store.ts lib/repository.ts lib/fake-repository.ts tests/repository.test.ts
git commit -m "feat: add seeded store and repository read/create"
```

---

### Task 5: 樂觀鎖更新（version + hash）、無變更與重複送出

**Files:**
- Modify: `lib/fake-repository.ts`
- Test: `tests/repository.test.ts`（追加）

**Interfaces:**
- Consumes: Task 4 的 `FakeSheetRepository`、`VersionConflictError`
- Produces: `FakeSheetRepository.update(rowId, input, actorLabel, opId): WriteResult` 的完整行為，供 Task 7 的 PATCH 使用。

- [ ] **Step 1: 追加失敗測試**

在 `tests/repository.test.ts` 追加：
```ts
describe("update 樂觀鎖", () => {
  it("版本相符時寫入、版本 +1、產生 update 稽核", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    const result = repo.update(
      created._row_id,
      { ...input, status: "done", version: created._version, baseHash: created.content_hash },
      "demo@example.com",
      "op-2",
    );
    expect(result.row._version).toBe(2);
    expect(result.row.status).toBe("done");
    expect(result.audit?.action).toBe("update");
    expect(result.audit?.diff).toEqual([{ field: "status", before: "active", after: "done" }]);
  });

  it("版本過期時丟 VersionConflictError 且不改資料", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    repo.update(created._row_id, { ...input, status: "done", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-2");
    expect(() =>
      repo.update(created._row_id, { ...input, status: "blocked", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-3"),
    ).toThrowError(/VERSION_CONFLICT/);
    expect(repo.get(created._row_id)?.status).toBe("done");
  });

  it("版本相同但 baseHash 過期時仍衝突（外部改過其他欄位）", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    getStore().rows.set(created._row_id, { ...getStore().rows.get(created._row_id)!, notes: "Sheet 直接改" });
    expect(() =>
      repo.update(created._row_id, { ...input, amount: 1, version: 1, baseHash: created.content_hash }, "demo@example.com", "op-2"),
    ).toThrowError(/VERSION_CONFLICT/);
    expect(repo.get(created._row_id)?.amount).toBe(120000);
  });

  it("無變更回 200 語意：不遞增版本、不寫稽核", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    const beforeAudits = repo.audit(created._row_id).length;
    const result = repo.update(
      created._row_id,
      { ...input, version: 1, baseHash: created.content_hash },
      "demo@example.com",
      "op-2",
    );
    expect(result.row._version).toBe(1);
    expect(result.audit).toBeNull();
    expect(repo.audit(created._row_id)).toHaveLength(beforeAudits);
  });

  it("同一版本連續送出兩次，第二次衝突", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    repo.update(created._row_id, { ...input, status: "done", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-2");
    expect(() =>
      repo.update(created._row_id, { ...input, status: "blocked", version: 1, baseHash: created.content_hash }, "demo@example.com", "op-3"),
    ).toThrowError(/VERSION_CONFLICT/);
  });

  it("找不到列丟 RowNotFoundError", () => {
    expect(() => repo.update("missing", { ...input, version: 1, baseHash: "sha256:x" }, "demo@example.com", "op")).toThrowError(/ROW_NOT_FOUND/);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/repository.test.ts`
Expected: 新增的 update 測試 FAIL（`repo.update is not a function`）。

- [ ] **Step 3: 實作 `update`**

- 找列；找不到丟 `RowNotFoundError`。
- `mine = pickFields(input)`；若 `input.version !== row._version || input.baseHash !== hashFields(row)` → 丟 `VersionConflictError(input.version, input.baseHash, mine, this.toView(row))`。
- `diffFields(pickFields(row), mine).length === 0` → 回 `{ row: this.toView(row), audit: null }`。
- 否則寫入 `{ ...row, ...mine, _version: row._version + 1, _updated_at: now, _updated_by: actorLabel, _op_id: opId }`，產生 `action: input.resolveConflict ? "resolve_conflict" : "update"` 稽核，`before` 為舊業務欄位、`after` 為 `mine`。

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -- tests/repository.test.ts`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add lib/fake-repository.ts tests/repository.test.ts
git commit -m "feat: enforce version and hash optimistic locking"
```

---

### Task 6: 模擬外部修改、stale 與稽核排序

**Files:**
- Modify: `lib/fake-repository.ts`
- Test: `tests/repository.test.ts`（追加）

**Interfaces:**
- Consumes: Task 5 的 `update`
- Produces: `simulateExternal(rowId: string): WriteResult`；`audit(rowId): AuditEvent[]` 新到舊；`RowView.stale` 行為。

- [ ] **Step 1: 追加失敗測試**

```ts
describe("simulateExternal", () => {
  it("改變業務欄位但不遞增 _version，並留下 external 稽核", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    const result = repo.simulateExternal(created._row_id);
    expect(result.row._version).toBe(1);
    expect(result.row.content_hash).not.toBe(created.content_hash);
    expect(result.row.status).not.toBe("active");
    expect(result.row.stale).toBe(true);
    expect(result.audit?.source).toBe("external");
    expect(result.audit?.actorLabel).toBe("unknown (Sheet)");
  });

  it("外部修改後，UI 以最新 version + hash 寫入即可清除 stale", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    const external = repo.simulateExternal(created._row_id).row;
    const mine = {
      project_name: external.project_name,
      client: external.client,
      status: external.status,
      owner: external.owner,
      amount: external.amount,
      notes: "UI 補述",
    };
    const result = repo.update(
      created._row_id,
      { ...mine, version: external._version, baseHash: external.content_hash },
      "demo@example.com",
      "op-2",
    );
    expect(result.row.stale).toBe(false);
    expect(result.row._version).toBe(2);
  });

  it("audit 回傳新到舊", () => {
    const created = repo.create(input, "demo@example.com", "op-1").row;
    repo.simulateExternal(created._row_id);
    const events = repo.audit(created._row_id);
    expect(events[0].source).toBe("external");
    expect(events[1].action).toBe("create");
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/repository.test.ts`
Expected: 新增測試 FAIL（`simulateExternal is not a function`）。

- [ ] **Step 3: 實作 `simulateExternal` 與 `audit`**

- 找列；找不到丟 `RowNotFoundError`。
- 只改兩個欄位：`status` 推進到下一個狀態（`done` 之後回到 `planning`）、`notes` 附加「（外部修改）」，並截斷至 500 字。
- 保留原 `_version`；更新 `_updated_at`、`_updated_by: "unknown (Sheet)"`、`_op_id: crypto.randomUUID()`。
- 寫入 `source: "external"`、`actorLabel: "unknown (Sheet)"`、`action: "update"` 的稽核。
- `audit(rowId)` 以寫入順序反轉回傳（新到舊），不重新排序時間戳。

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -- tests/repository.test.ts`
Expected: 全部 passed。

- [ ] **Step 5: Commit**

```bash
git add lib/fake-repository.ts tests/repository.test.ts
git commit -m "feat: simulate external sheet edits with stale detection"
```

---

### Task 7: Route Handlers 與 409 payload

**Files:**
- Create: `lib/conflict.ts`
- Create: `app/api/rows/route.ts`, `app/api/rows/[rowId]/route.ts`, `app/api/rows/[rowId]/simulate-external/route.ts`, `app/api/audit/route.ts`
- Test: `tests/conflict.test.ts`, `tests/api.test.ts`

**Interfaces:**
- Consumes: `FakeSheetRepository`、`getStore`、`resetStore`、schema、`VersionConflictError`、`RowNotFoundError`
- Produces:
  - `toConflictPayload(error: VersionConflictError): ConflictPayload`
  - `GET /api/rows → { rows: RowView[]; lastSyncedAt: string | null }`
  - `POST /api/rows` body `ProjectFields` → 201 `WriteResult`
  - `PATCH /api/rows/[rowId]` body `UpdateRowInput` → 200 `WriteResult`、400、404、409
  - `POST /api/rows/[rowId]/simulate-external` → 200 `WriteResult`、404
  - `GET /api/audit?rowId=` → `{ events: AuditEvent[] }`、400
  - Client 端錯誤格式：`{ error: { code, message, fields? } }`

- [ ] **Step 1: 寫失敗測試**

`tests/conflict.test.ts`：
```ts
import { describe, expect, it } from "vitest";
import { toConflictPayload } from "@/lib/conflict";
import { VersionConflictError } from "@/lib/repository";
import type { ProjectFields, RowView } from "@/lib/schema";

const mine: ProjectFields = {
  project_name: "我的版本",
  client: "Acme",
  status: "done",
  owner: "Ariel",
  amount: 1,
  notes: "",
};

const current: RowView = {
  ...mine,
  project_name: "Sheet 版本",
  _row_id: "row-1",
  _version: 3,
  _updated_at: "2026-01-01T00:00:00.000Z",
  _updated_by: "unknown (Sheet)",
  _op_id: "op",
  _deleted: false,
  content_hash: "sha256:abc",
  stale: true,
};

describe("toConflictPayload", () => {
  it("帶出 base 版本、hash、我的輸入與目前列", () => {
    const payload = toConflictPayload(new VersionConflictError(2, "sha256:old", mine, current));
    expect(payload.error.code).toBe("VERSION_CONFLICT");
    expect(payload.conflict.baseVersion).toBe(2);
    expect(payload.conflict.baseHash).toBe("sha256:old");
    expect(payload.conflict.mine).toEqual(mine);
    expect(payload.conflict.current).toEqual(current);
  });
});
```

`tests/api.test.ts`：
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { POST as createRow } from "@/app/api/rows/route";
import { PATCH as updateRow } from "@/app/api/rows/[rowId]/route";
import { POST as simulateExternal } from "@/app/api/rows/[rowId]/simulate-external/route";
import { GET as getAudit } from "@/app/api/audit/route";
import { resetStore } from "@/lib/store";

const valid = {
  project_name: "官網改版",
  client: "Acme",
  status: "active",
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTestRow() {
  const res = await createRow(jsonRequest("http://localhost/api/rows", "POST", valid));
  return (await res.json()) as { row: { _row_id: string; _version: number; content_hash: string } };
}

beforeEach(() => resetStore());

describe("route handlers", () => {
  it("POST /api/rows 回 201 與稽核", async () => {
    const res = await createRow(jsonRequest("http://localhost/api/rows", "POST", valid));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.row._version).toBe(1);
    expect(body.audit.action).toBe("create");
  });

  it("POST /api/rows 驗證失敗回 400", async () => {
    const res = await createRow(jsonRequest("http://localhost/api/rows", "POST", { ...valid, amount: "12,000" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields.amount).toBeTruthy();
  });

  it("PATCH 版本過期回 409 並附 conflict", async () => {
    const created = await createTestRow();
    const res = await updateRow(
      jsonRequest(`http://localhost/api/rows/${created.row._row_id}`, "PATCH", {
        ...valid,
        status: "done",
        version: 1,
        baseHash: created.row.content_hash,
      }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(res.status).toBe(200);

    const conflict = await updateRow(
      jsonRequest(`http://localhost/api/rows/${created.row._row_id}`, "PATCH", {
        ...valid,
        status: "blocked",
        version: 1,
        baseHash: created.row.content_hash,
      }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(conflict.status).toBe(409);
    const body = await conflict.json();
    expect(body.conflict.baseVersion).toBe(1);
    expect(body.conflict.current._version).toBe(2);
  });

  it("外部修改後版本相同但 hash 過期也回 409", async () => {
    const created = await createTestRow();
    const external = await simulateExternal(
      new Request(`http://localhost/api/rows/${created.row._row_id}/simulate-external`, { method: "POST" }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(external.status).toBe(200);

    const res = await updateRow(
      jsonRequest(`http://localhost/api/rows/${created.row._row_id}`, "PATCH", {
        ...valid,
        amount: 1,
        version: created.row._version,
        baseHash: created.row.content_hash,
      }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(res.status).toBe(409);
  });

  it("未知列回 404、缺 rowId 回 400", async () => {
    const missing = await updateRow(
      jsonRequest("http://localhost/api/rows/missing", "PATCH", { ...valid, version: 1, baseHash: "sha256:x" }),
      { params: Promise.resolve({ rowId: "missing" }) },
    );
    expect(missing.status).toBe(404);

    const noRowId = await getAudit(new Request("http://localhost/api/audit"));
    expect(noRowId.status).toBe(400);
  });

  it("GET /api/audit 回傳該列事件", async () => {
    const created = await createTestRow();
    const res = await getAudit(new Request(`http://localhost/api/audit?rowId=${created.row._row_id}`));
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].action).toBe("create");
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/conflict.test.ts tests/api.test.ts`
Expected: FAIL，找不到 `@/lib/conflict` 與 route 模組。

- [ ] **Step 3: 實作 `lib/conflict.ts`**

回傳 `{ error: { code: "VERSION_CONFLICT", message: "此列已被修改，請選擇要保留的版本" }, conflict: { baseVersion, baseHash, mine, current } }`。

- [ ] **Step 4: 實作四個 route 模組**

- 使用標準 `Request`/`Response.json`，不 import `NextResponse`。
- 兩個 GET handler（`/api/rows`、`/api/audit`）都必須加 `export const dynamic = "force-dynamic";`，否則 Next 可能在 build 時把回應靜態化，讀到舊的記憶體快照。
- `export const ACTOR = "demo@example.com"` 放在 `app/api/rows/route.ts` 會讓其他檔匯入耦合；改為各檔內常數 `const ACTOR = "demo@example.com"`。
- Body 解析：`await request.json().catch(() => null)`。
- zod 失敗：`Response.json({ error: { code: "VALIDATION_ERROR", message: "欄位驗證失敗", fields: parsed.error.flatten().fieldErrors } }, { status: 400 })`。若安裝到的 zod 版本已移除 `flatten()`，改用 `z.flattenError(parsed.error).fieldErrors`，測試不變。
- 動態路由簽名：`{ params }: { params: Promise<{ rowId: string }> }`，先 `const { rowId } = await params`。
- PATCH 依序捕捉 `RowNotFoundError` → 404 `ROW_NOT_FOUND`、`VersionConflictError` → `toConflictPayload` 409；其他錯誤重新拋出。
- `GET /api/rows` 回 `{ rows: repo.list(), lastSyncedAt: repo.lastSyncedAt() }`。
- `POST /api/rows` 以 `crypto.randomUUID()` 作為 `opId`，201。
- `simulate-external` 與 PATCH 同樣以 `crypto.randomUUID()` 傳入（PATCH 的 opId 由 route 產生）。
- `GET /api/audit` 缺 `rowId` 回 400 `VALIDATION_ERROR`。

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -- tests/conflict.test.ts tests/api.test.ts`
Expected: 全部 passed。

- [ ] **Step 6: Commit**

```bash
git add lib/conflict.ts app/api tests/conflict.test.ts tests/api.test.ts
git commit -m "feat: add API routes with conflict payloads"
```

---

### Task 8: Client API 層、Console shell 與表格

**Files:**
- Create: `lib/api.ts`, `lib/format.ts`, `components/ui.tsx`, `components/console.tsx`, `components/data-table.tsx`
- Modify: `app/page.tsx`
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: `RowView`、`AuditEvent`、`ConflictPayload`、`ProjectFields`、`UpdateRowInput`
- Produces:
  - `class ApiError extends Error { status: number; code: string; conflict: ConflictPayload["conflict"] | null }`
  - `api.rows()`、`api.create(input)`、`api.update(rowId, input)`、`api.simulateExternal(rowId)`、`api.audit(rowId)`
  - `formatAmount(amount: number): string`、`formatDateTime(iso: string): string`
  - `Button`、`Input`、`Select`、`Label`、`Badge`、`Dialog`（`components/ui.tsx`）
  - `<Console initialRows={RowView[]} initialLastSyncedAt={string | null} />`
  - `<DataTable rows selectedRowId onSelect />`

- [ ] **Step 1: 寫失敗測試**

`tests/format.test.ts`：
```ts
import { describe, expect, it } from "vitest";
import { formatAmount, formatDateTime } from "@/lib/format";

describe("format", () => {
  it("金額以 NT$ 千分位顯示", () => {
    expect(formatAmount(120000)).toBe("NT$120,000");
    expect(formatAmount(0)).toBe("NT$0");
  });

  it("時間以台北時區顯示且含年份", () => {
    expect(formatDateTime("2026-01-01T00:00:00.000Z")).toMatch(/2026/);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/format.test.ts`
Expected: FAIL，找不到 `@/lib/format`。

- [ ] **Step 3: 實作 `lib/format.ts` 與 `lib/api.ts`**

- `formatAmount` 以 `NT$${amount.toLocaleString("en-US")}` 實作，避免不同 ICU 版本對 `zh-TW` + `TWD` 的符號差異。
- `formatDateTime` 用 `Intl.DateTimeFormat("zh-TW", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei" })`。
- `api` 內部統一 `fetch`，帶 `content-type: application/json` 與 `cache: "no-store"`；非 2xx 解析 body 後丟 `ApiError`；`ApiError.conflict` 只在 body 有 `conflict` 時回傳。

- [ ] **Step 4: 實作 `components/ui.tsx`**

只做 POC 需要的樣式元件；`Dialog` 用固定定位遮罩 + 白色面板，點遮罩關閉，`role="dialog"`、`aria-modal="true"`。不要引入額外套件。

- [ ] **Step 5: 實作 `components/data-table.tsx`**

- `"use client"`。
- TanStack Table：`getCoreRowModel`、`getSortedRowModel`、`getPaginationRowModel`。
- 預設排序 `_updated_at` 降冪；每頁 20 列；提供上一頁/下一頁與頁碼。
- 欄位：專案名稱、客戶、狀態（`Badge` + `STATUS_LABELS`）、負責人、金額（`formatAmount`）、更新時間（`formatDateTime`）。
- stale 列在專案名稱旁顯示「外部變更」`Badge`（`tone="warn"`）。
- 列的 `key` 與點擊 handler 一律用 `row._row_id`；選取列加背景色。

- [ ] **Step 6: 實作 `components/console.tsx` 與 `app/page.tsx`**

`console.tsx` 此階段只做：
- props `initialRows`、`initialLastSyncedAt`。
- state：`rows`、`lastSyncedAt`、`query`、`statusFilter`、`selectedRowId`、`notice`。
- 搜尋（`project_name`/`client`/`owner`，忽略大小寫）與狀態篩選在 client 過濾後交給 `DataTable`。
- Header 顯示「Fake Sheets · {rows.length} rows」、最後同步時間（`lastSyncedAt` 為 `null` 顯示「—」，否則 `formatDateTime`）。
- 點列設定 `selectedRowId`；右側預留稽核面板位置（Task 11 填入）。
- 工具列的「模擬外部修改」按鈕：目標為 `selectedRowId ?? filteredRows[0]?._row_id`；呼叫 `api.simulateExternal` 後 `refresh()` 並顯示 notice；若無列則停用。

`app/page.tsx` 改為 server component，並強制每次請求重繪（記憶體資料會變動，不能靜態化）：
```tsx
import { Console } from "@/components/console";
import { FakeSheetRepository } from "@/lib/fake-repository";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Page() {
  const repo = new FakeSheetRepository(getStore());
  return <Console initialRows={repo.list()} initialLastSyncedAt={repo.lastSyncedAt()} />;
}
```

- [ ] **Step 7: 驗證**

Run: `npm test -- tests/format.test.ts`
Expected: passed。

Run: `npm run typecheck`
Expected: 無錯誤。

Run: `npm run dev`，開 `http://localhost:3000`
Expected: 看到標題、1000 列（分頁 20 列）、可搜尋「專案 001」、可切換排序、點列有選取樣式；選取某列後改變排序或翻頁，該列仍保持選取（以 `_row_id` 識別）；重整後仍為 1000 列。

- [ ] **Step 8: Commit**

```bash
git add lib/api.ts lib/format.ts components/ui.tsx components/console.tsx components/data-table.tsx app/page.tsx tests/format.test.ts
git commit -m "feat: add console shell and sortable data table"
```

---

### Task 9: 新增/編輯表單與 409 銜接

**Files:**
- Create: `components/row-form-dialog.tsx`
- Modify: `components/console.tsx`
- Test: 無新增自動測試；以 typecheck、build 與手動步驟驗證

**Interfaces:**
- Consumes: `projectFieldsSchema`、`ProjectFields`、`api.create`、`api.update`、`ApiError`
- Produces:
  - `<RowFormDialog title initial initialVersion? submitting serverError onSubmit onClose />`，其中 `initial: ProjectFields | null`（`null` 代表新增）
  - `Console` 內 `PendingConflict = { rowId: string; base: ProjectFields; mine: ProjectFields; conflict: ConflictPayload["conflict"] }`（Task 10 使用）

- [ ] **Step 1: 實作 `components/row-form-dialog.tsx`**

- Props：
```ts
{
  title: string;
  initial: ProjectFields | null;
  initialVersion?: number;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (input: ProjectFields) => void;
  onClose: () => void;
}
```
- `initial === null` 代表新增：狀態預設 `planning`，金額顯示空字串，其餘空白。
- 所有欄位以字串 state 保存（`amount` 也是字串），避免輸入過程被強制轉型。
- 送出時：`amount` 空白或 `Number(raw)` 為 `NaN` → 顯示「金額必須是數字」；其餘交給 `projectFieldsSchema.safeParse`，失敗時把 `fieldErrors` 逐欄顯示。
- 驗證通過才呼叫 `onSubmit(parsed.data)`。
- 狀態用 `select`（四個 `STATUS_LABELS`）；備註用 `textarea`。
- `submitting` 時所有輸入與送出按鈕 disabled；`serverError` 顯示在表單頂部。
- 標題列顯示 `版本 {initialVersion}`（編輯模式）。

- [ ] **Step 2: 在 `console.tsx` 接上新增/編輯**

- state 增加 `form: { mode: "create" } | { mode: "edit"; row: RowView; base: ProjectFields } | null`、`submitting`、`formError`、`pendingConflict`。
- 「新增」按鈕開 create 表單（`initial: null`）。
- 編輯：`base = pickFields(row)`（從 `@/lib/diff` 匯入），保存 `row._version` 與 `row.content_hash`。
- 送出 create：`api.create(input)` → `refresh()`、關閉、選取新列、notice「已新增」。
- 送出 edit：`api.update(row._row_id, { ...input, version: row._version, baseHash: row.content_hash })`。
  - 成功：`refresh()`、關閉、notice「已儲存」。
  - `ApiError` 且 `status === 409` 且 `conflict` 存在：設定 `pendingConflict = { rowId, base, mine: input, conflict }`，關閉表單（Task 10 會開衝突視窗）。
  - 其他錯誤：`formError = error.message`，表單保持開啟。
- 409 時**不可**呼叫 `refresh()` 覆蓋畫面成「成功」狀態。

- [ ] **Step 3: 驗證**

Run: `npm run typecheck`、`npm run build`
Expected: 均成功。

Run: `npm run dev`，手動檢查：
1. 新增一列合法資料 → 表格最上方（依更新時間排序）出現、`_version` 為 1。
2. 金額輸入 `12,000` → 顯示金額錯誤且不送出。
3. 編輯既有列 → 儲存後更新時間改變。
4. 重新整理 → 新增的列仍在（同一個 dev server process 的記憶體）；重啟 dev server 後回到 1000 列，`_row_id` 不變。

- [ ] **Step 4: Commit**

```bash
git add components/row-form-dialog.tsx components/console.tsx
git commit -m "feat: add create/edit form with validation and 409 handling"
```

---

### Task 10: 衝突對話框與解決流程

**Files:**
- Create: `components/conflict-dialog.tsx`
- Modify: `components/console.tsx`

**Interfaces:**
- Consumes: `pendingConflict`（Task 9）、`api.update`、`ApiError`
- Produces: `<ConflictDialog base mine conflict submitting onKeepMine onKeepSheet />`

- [ ] **Step 1: 實作 `components/conflict-dialog.tsx`**

- Props：
```ts
{
  base: ProjectFields;
  mine: ProjectFields;
  conflict: ConflictPayload["conflict"]; // current: RowView
  submitting: boolean;
  onKeepMine: () => void;
  onKeepSheet: () => void;
}
```
- 三欄表格：欄位名稱、基準版本（`base`）、我的版本（`mine`）、Sheet 目前版本（`conflict.current`）。
- 只列出三者任一不同的欄位（比較 `base`/`mine`/`current` 的業務欄位）；若全部相同則列出全部欄位避免空表。
- 我的版本與目前版本不同的儲存格加底色，讓使用者一眼看到衝突點。
- 按鈕：「保留我的」（primary）、「保留 Sheet」（ghost）；`submitting` 時 disabled。
- 顯示 `_version`：`baseVersion: {conflict.baseVersion}`、`current: {conflict.current._version}`。

- [ ] **Step 2: 在 `console.tsx` 接上解決流程**

- `pendingConflict` 存在時渲染 `ConflictDialog`。
- `onKeepMine`：
```ts
await api.update(pendingConflict.rowId, {
  ...pendingConflict.mine,
  version: pendingConflict.conflict.current._version,
  baseHash: pendingConflict.conflict.current.content_hash,
  resolveConflict: true,
});
```
成功 → `refresh()`、清空 `pendingConflict`、選取該列、notice「已保留我的版本」。
- `onKeepSheet`：`refresh()`、清空 `pendingConflict`、選取該列、notice「已改用 Sheet 版本」；**不得**呼叫 update。
- 兩個動作若再遇到 409（別人在此期間又改），以新的衝突 payload 覆蓋 `pendingConflict`，不關閉視窗。
- 衝突解決後稽核 action 必須是 `resolve_conflict`。

- [ ] **Step 3: 驗證**

Run: `npm run typecheck`、`npm run build`
Expected: 成功。

Run: `npm run dev`，手動檢查：
1. 選一列 → 編輯 → 改狀態 → **先按「模擬外部修改」** → 儲存 → 出現三欄衝突視窗且原資料未被覆蓋。
2. 只改「備註」再儲存 → 仍出現 409（hash 攔截）。
3. 「保留我的」→ 列更新、稽核出現 `resolve_conflict`、stale 標記消失。
4. 重做一次，選「保留 Sheet」→ 列顯示 Sheet 值、無新稽核、版本未增加。

- [ ] **Step 4: Commit**

```bash
git add components/conflict-dialog.tsx components/console.tsx
git commit -m "feat: add three-way conflict resolution dialog"
```

---

### Task 11: 稽核面板

**Files:**
- Create: `components/audit-panel.tsx`
- Modify: `components/console.tsx`

**Interfaces:**
- Consumes: `api.audit`、`AuditEvent`、`FIELD_LABELS`、`formatDateTime`
- Produces: `<AuditPanel events loading rowLabel />`

- [ ] **Step 1: 實作 `components/audit-panel.tsx`**

- Props：`{ events: AuditEvent[]; loading: boolean; rowLabel: string }`。
- 標題顯示「稽核紀錄 · {rowLabel}」。
- 新到舊列表；每筆顯示：
  - `source` 徽章：`ui` → 「UI」、`external` → 「Sheet 直接修改」。
  - `action` 中文：建立／更新／解決衝突。
  - `actorLabel` 與 `formatDateTime(createdAt)`。
  - `diff` 每行：`FIELD_LABELS[field]：{before} → {after}`；`before === null` 顯示「（新值）」。
- 空狀態顯示「此列尚無稽核紀錄」；`loading` 顯示「載入中…」。

- [ ] **Step 2: 在 `console.tsx` 接上**

- state：`auditEvents: AuditEvent[]`、`auditLoading`。
- `useEffect` 監看 `selectedRowId`：有值時 `api.audit(selectedRowId)`，以 request 序號或 `cancelled` 旗標避免競態；無值清空。
- 每次 `refresh()` 後若 `selectedRowId` 仍存在，重新抓取稽核（讓新事件立即出現）。
- 右側面板在 `selectedRowId` 為 `null` 時顯示提示「選取一列查看稽核」。

- [ ] **Step 3: 驗證**

Run: `npm run typecheck`、`npm run build`
Expected: 成功。

Run: `npm run dev`，手動檢查：
1. 新增列 → 稽核顯示「建立」與六個欄位的新值。
2. 編輯狀態 → 稽核出現「更新」，diff 只有狀態一行。
3. 模擬外部修改 → 稽核出現「Sheet 直接修改」，actor 為 `unknown (Sheet)`。
4. 快速切換不同列 → 面板內容對應正確列，不出現上一列殘影。

- [ ] **Step 4: Commit**

```bash
git add components/audit-panel.tsx components/console.tsx
git commit -m "feat: add per-row audit timeline with diffs"
```

---

### Task 12: README、整體驗證與收尾

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: 全部
- Produces: 可交付的 POC 與操作說明。

- [ ] **Step 1: 更新 `README.md`**

把「狀態」改為「POC 完成（in-memory，未接 Google Sheets）」，新增：
- 啟動方式：`npm install`、`npm run dev`、`npm test`、`npm run typecheck`、`npm run build`。
- POC 包含什麼、刻意不包含什麼（引用 spec 的非目標）。
- 明確說明：資料存在單一 process 的記憶體，**不可部署到 Vercel 當正式服務**；重啟即重置。
- 五步驟示範：編輯 → 模擬外部修改 → 409 → 保留我的 → 看稽核。
- 指向 `docs/superpowers/specs/2026-10-26-sheets-console-poc-design.md`。

- [ ] **Step 2: 跑完整驗證**

Run: `npm test`
Expected: 全部 passed（schema、hash、diff、repository、conflict、api、format）。

Run: `npm run typecheck`
Expected: 無錯誤。

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 逐項手動驗收 spec §9**

1. 首頁 1000 列。
2. 搜尋、狀態篩選、排序、分頁。
3. 新增 → 稽核 `create`。
4. 編輯 → 版本 +1、稽核 `update` 與 diff。
5. 編輯框開著時模擬外部修改 → 儲存出現 409。
6. 外部修改後只改其他欄位 → 仍 409。
7. 保留我的 → 稽核 `resolve_conflict`。
8. 保留 Sheet → 回到 Sheet 值、無新寫入。

- [ ] **Step 4: 確認沒有敏感或暫存檔**

Run: `git status --short`
Expected: 只有預期的檔案；無 `.env`、`.next`、`node_modules`。

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document POC usage and scope"
```

---

## Self-Review 紀錄

- **Spec coverage**：§2 架構 → Task 4/7；§3 技術 → Task 1；§4 模型 → Task 2/4；§5 API 與 409 → Task 5/7；§5.2 外部修改 → Task 6；§5.3 stale → Task 6/8；§6 UI → Task 8/9/10/11；§7 檔案 → 各 task；§8 測試 → Task 2–7；§9 驗收 → Task 12。
- **Step scan**：UI task 以 props、狀態與行為描述，不逐行轉錄；演算法（stale、外部變更、hash canonical）有明確規則。
- **Type consistency**：`UpdateRowInput` 一律含 `version`/`baseHash`；`WriteResult.audit` 可為 `null`；`RowView` 一律帶 `content_hash` 與 `stale`；route 的 `opId` 由 handler 產生。
- **Review Focus**：五條分別由 Task 2、Task 5（兩條）、Task 4/Task 8 的測試或手動步驟覆蓋。
