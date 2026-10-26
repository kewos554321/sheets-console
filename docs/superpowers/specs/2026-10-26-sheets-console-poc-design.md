# Sheets Console — 最小 POC 設計

> 日期：2026-10-26
> 狀態：已與使用者確認方向，待 spec 審閱
> 上層文件：[PLAN.md](../../../PLAN.md)

## 1. 目的

用一個可點擊的垂直切片，驗證 PLAN 的核心主張：

> Sheet 是資料真實來源，但所有寫入都經過 UI；系統用 `_version` + content hash 防止無聲覆蓋，
> 並把每一次變更（包含有人直接改 Sheet）都留下可回追的稽核紀錄。

POC 不使用真實 Google Sheets、資料庫或登入。所有基礎設施以介面與記憶體實作取代，
讓產品流程可以在數分鐘內被操作與檢驗。

### 成功標準

1. 種子 1000 列可搜尋、排序、分頁，本機 p95 < 1.5 秒。
2. 以過期 `_version` 儲存必定得到 409，且資料不被覆蓋；使用者能看到三欄差異並選擇解法。
3. 模擬外部修改後，該列出現 `source=external` 稽核事件，UI 顯示 stale。
4. 每一次寫入都產生 audit event，`diff` 只含變更欄位的前後值。
5. 核心邏輯（schema、版本比對、diff）有單元測試且通過。

### 非目標

登入與角色權限、真實 Google Sheets adapter、Postgres/Drizzle、Apps Script/webhook、輪詢同步、
快照與回滾、刪除與軟刪除、匯出、多分頁、E2E 測試。以上僅在程式註解或介面留出替換點。

## 2. 架構

```text
Browser
  └─ React client components（表格 / 表單 / 衝突 / 稽核）
        │ fetch JSON
Next.js Route Handlers（server-side 驗證 + 版本檢查）
        │
SheetRepository（port）
        └─ FakeSheetRepository（in-memory singleton，globalThis）
             ├─ rows: Map<row_id, SheetRow>
             └─ audit_events: AuditEvent[]
```

- 前端不直接持有資料來源，一律經由 Route Handler。
- `SheetRepository` 只負責讀寫列與版本，不含驗證、權限或稽核格式。
- 稽核寫入由 Route Handler 與 repository 在同一個同步呼叫中完成（記憶體版本無交易需求）。
- 選用 Route Handlers 而非 Server Actions，是為了讓 409/403 等 HTTP 語意與未來的 Google adapter
  邊界保持一致。

## 3. 技術選擇

| 項目 | 選擇 |
|---|---|
| 框架 | Next.js（App Router）+ TypeScript（strict） |
| 樣式 | Tailwind CSS（不引入 shadcn/ui） |
| 表格 | TanStack Table（client-side 搜尋/排序/分頁） |
| 驗證 | zod，schema 由 client 與 server 共用 |
| 測試 | Vitest（僅單元測試） |
| 執行 | `npm run dev`；無外部服務、無環境變數 |

## 4. 資料模型

### 4.1 業務資料：專案清單

| 欄位 | 型別 | 規則 |
|---|---|---|
| `project_name` | string | 必填，1-80 字 |
| `client` | string | 必填，1-80 字 |
| `status` | enum | `planning` / `active` / `blocked` / `done` |
| `owner` | string | 必填，1-40 字 |
| `amount` | number | 0 以上整數（TWD） |
| `notes` | string | 選填，最多 500 字 |

### 4.2 中繼欄位

| 欄位 | 說明 |
|---|---|
| `_row_id` | UUID，建立後不變 |
| `_version` | 整數，每次成功寫入 +1 |
| `_updated_at` | ISO 8601 UTC |
| `_updated_by` | POC 固定為 `demo@example.com` |
| `_op_id` | 每次寫入產生的 UUID，供未來回音抑制使用 |
| `_deleted` | 保留欄位，POC 固定 `false` |

### 4.3 稽核事件

```ts
type AuditEvent = {
  id: string;
  rowId: string;
  actorLabel: string;
  source: "ui" | "external";
  action: "create" | "update" | "resolve_conflict";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: Array<{ field: string; before: unknown; after: unknown }>;
  opId: string | null;
  createdAt: string;
};
```

`diff` 只包含實際變更的業務欄位（不含 `_version`、`_updated_at` 等中繼欄位）。

## 5. API 契約

所有回應為 JSON；錯誤格式統一：

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "..." } }
```

| Method | Path | 說明 |
|---|---|---|
| `GET` | `/api/rows` | 回傳全部未刪除列；搜尋、排序、分頁皆在 client 端處理，伺服器不接受查詢參數 |
| `POST` | `/api/rows` | 建立列，回傳新列 |
| `PATCH` | `/api/rows/[rowId]` | 更新，body 需含 `version` 與業務欄位 |
| `POST` | `/api/rows/[rowId]/simulate-external` | 模擬 Sheet 被直接修改 |
| `GET` | `/api/audit?rowId=` | 回傳該列稽核事件，新到舊 |

### 5.1 PATCH 規則

1. zod 驗證 body；失敗 → `400 VALIDATION_ERROR`，附欄位錯誤。
2. 找不到列 → `404 ROW_NOT_FOUND`。
3. `version` 與目前 `_version` 不符 → `409 VERSION_CONFLICT`，body：

```json
{
  "error": { "code": "VERSION_CONFLICT", "message": "..." },
  "conflict": {
    "baseVersion": 3,
    "mine": { "project_name": "...", "status": "..." },
    "current": { "project_name": "...", "status": "...", "_version": 4 }
  }
}
```

4. 相符 → 寫入、`_version + 1`、記錄稽核 `action=update`（或 `resolve_conflict`，當 body 帶
   `resolveConflict: true`）。
5. 值沒有實際變更 → 仍回 200，但不寫稽核、不遞增版本（避免無意義事件）。

### 5.2 simulate-external

- body 可帶 `rowId`：有指定就改該列，否則隨機挑一列。UI 在已有選取列時傳入該列，
  確保「開著編輯框 → 模擬外部修改 → 儲存」必定命中同一列而觸發衝突。
- 修改 1-2 個業務欄位。
- **不遞增 `_version`**，模擬不遵守版本規則的外部編輯者。
- 寫入 `source=external`、`actorLabel="unknown (Sheet)"` 的稽核事件。
- 回傳更新後的列與事件；client 據此在列上標記 stale。

### 5.3 Stale 判定

POC 以「該列存在 `source=external` 且時間晚於最後一次 UI 寫入」作為 stale 標記，並在列上顯示。
編輯對話框開啟時會攜帶當時的 `_version`，因此 stale 列儲存時會自然觸發 409。

## 6. UI 結構

單一路由 `/`，分為四個區塊：

1. **Header**：標題、資料來源說明（`Fake Sheets · 1000 rows`）、最後同步時間（最近一次寫入的
   `_updated_at`）、模擬外部修改按鈕（有選取列時打該列，否則隨機一列）。
2. **Toolbar**：搜尋框（專案/客戶/負責人）、狀態篩選、新增按鈕。
3. **Table**：TanStack Table，欄位為專案、客戶、狀態、負責人、金額、更新時間；
   stale 列顯示標記；點列開啟編輯。
4. **Side panel**：選取列的稽核時間軸與欄位級 diff。

對話框：

- **Row form**：新增/編輯共用；client 端 zod 驗證；送出中禁用按鈕。
- **Conflict**：顯示基準版本、我的輸入、Sheet 目前值三欄差異；提供「保留我的」與「保留 Sheet」。
  - 保留我的 → 以目前的 `_version` 重新 PATCH，`resolveConflict: true`。
  - 保留 Sheet → 關閉對話框並以伺服器最新資料重繪，不寫入。
  - 逐欄合併不在 POC 範圍。

錯誤處理：API 非 2xx 時顯示可讀訊息；409 一律開衝突視窗，不顯示成功。

## 7. 檔案結構

```text
app/
  layout.tsx
  page.tsx
  globals.css
  api/rows/route.ts
  api/rows/[rowId]/route.ts
  api/rows/[rowId]/simulate-external/route.ts
  api/audit/route.ts
components/
  console.tsx           client shell，持有選取列與對話框狀態
  data-table.tsx
  row-form-dialog.tsx
  conflict-dialog.tsx
  audit-panel.tsx
  ui.tsx                小型共用按鈕/輸入/徽章
lib/
  schema.ts             zod schema、型別、欄位定義
  repository.ts         SheetRepository 介面
  fake-repository.ts    in-memory 實作
  seed.ts               1000 列種子資料
  diff.ts               欄位 diff 計算
  store.ts              globalThis singleton
  api.ts               client 端 fetch 輔助
tests/
  schema.test.ts
  diff.test.ts
  fake-repository.test.ts
  conflict.test.ts      版本比對與衝突 payload
```

## 8. 測試策略

單元測試（Vitest）：

1. `rowInputSchema`：必填、長度、金額非負、狀態 enum。
2. `diffRows`：只回傳變更欄位；新增與無變更的邊界。
3. `FakeSheetRepository`：建立/更新遞增版本、版本不符丟出 conflict、外部模擬不遞增版本。
4. 衝突 payload 組裝：base/mine/current 正確。
5. 稽核：更新事件含正確 diff；無變更不產生事件。

不寫 E2E；以手動驗收清單補足（見 §9）。

## 9. 驗收清單

- [ ] `npm run dev` 啟動，首頁顯示 1000 列。
- [ ] 搜尋、狀態篩選、排序、分頁可用。
- [ ] 新增列成功，稽核出現 `create`。
- [ ] 編輯成功，版本 +1，稽核出現 `update` 與欄位 diff。
- [ ] 開著編輯框時按「模擬外部修改」，儲存 → 出現 409 衝突視窗。
- [ ] 衝突視窗選「保留我的」→ 寫入成功，稽核為 `resolve_conflict`。
- [ ] 衝突視窗選「保留 Sheet」→ 資料回到 Sheet 版本，無新寫入。
- [ ] `npm test` 全綠、`npm run build` 成功。

## 10. 未來替換點

- `FakeSheetRepository` → `GoogleSheetRepository`（Service Account + `values.batchGet/batchUpdate`）。
- 記憶體 store → Postgres `row_index` + `audit_events`（Drizzle）。
- Route Handler 內加入 session 與角色檢查（403）。
- `simulate-external` → Apps Script webhook 與輪詢對帳。
- `_op_id` 已寫入，可直接用於回音抑制。
