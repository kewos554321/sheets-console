# Google Sheets Adapter — 設計

> 日期：2026-10-26
> 狀態：待審閱
> 上層設計：[2026-10-26-sheets-console-poc-design.md](./2026-10-26-sheets-console-poc-design.md)

## 1. 目的

把現有 POC 的 `FakeSheetRepository` 換成真正讀寫 Google Sheets 的 adapter，讓 UI 的每一次新增／編輯直接落到 Google Sheet。
不改 UI 流程、不改 `SheetRepository` 介面；原本的 fake 保留作為無憑證時的 demo 模式。

### 成功標準

1. 設定齊全時，`npm run dev` 顯示 `Google Sheet · N rows`，資料來自指定分頁。
2. 在 UI 新增或編輯後，重新整理頁面仍看得到（資料已寫入 Sheet）。
3. 直接在 Google Sheet 改值 → 按「重新載入」看到新值；若在 UI 編輯期間被改，儲存必定 409。
4. 寫入只動變更欄位與中繼欄位，不覆寫整列。
5. 無憑證時仍可用 fake 模式啟動，`npm test` 不需要網路或憑證。

### 非目標

輪詢／webhook 自動同步、Postgres、Google 登入與角色、多分頁、schema 版本遷移、公式欄位、多人多實例鎖。

## 2. 設定

`.env.local`（已 gitignore）：

| 變數 | 必填 | 說明 |
|---|---|---|
| `GOOGLE_SA_KEY_FILE` | 是 | Service Account JSON 路徑，預設 `./secrets/sa.json` |
| `SHEET_SPREADSHEET_ID` | 是 | 目標 spreadsheet ID |
| `SHEET_TAB_NAME` | 否 | 分頁名稱，預設 `Projects` |
| `SHEET_SHARE_EMAIL` | 否 | 只給 setup 腳本用，建立後分享給此 email（writer） |

判定規則（`getGoogleConfig()`）：

- 四個變數都沒設 → 回 `null`，使用 fake。
- 只設了部分（缺 key file 或 spreadsheet ID）→ 丟 `ConfigError`，啟動失敗並說明缺哪個。
- 齊全但 key 檔不存在 → `ConfigError`。
- `SHEET_SHARE_EMAIL` 不影響 runtime。

## 3. Sheet 結構

分頁第一列固定為：

```
_row_id | _version | _updated_at | _updated_by | _op_id | _deleted |
project_name | client | status | owner | amount | notes
```

- 以 header 名稱映射；順序可不同，但所有必要 header 必須存在。
- 多餘欄位一律忽略，不讀也不寫。
- 缺少任何必要 header → `SheetError("SCHEMA_DRIFT")`，訊息列出缺少的名稱。
- 空列（`_row_id` 空白）跳過。
- 讀取使用 `valueRenderOption: "UNFORMATTED_VALUE"`：`amount` 為 number、`_version` 為 number、`_deleted` 為 boolean。
- 寫入使用 `valueInputOption: "RAW"`，避免使用者輸入被當成公式（`=...`）。
- 日期為 ISO 8601 UTC 字串，存在 Sheet 即文字。

## 4. 元件與介面

```text
Route Handlers / page.tsx
        │ getRepository()
repository-factory ──► GoogleSheetRepository ──► SheetsGateway ──► Google Sheets API
        └────────────► FakeSheetRepository（無設定時）
```

### 4.1 `lib/sheets/gateway.ts`

```ts
export type CellValue = string | number | boolean;
export type SheetMatrix = CellValue[][];

export interface SheetsGateway {
  readAll(): Promise<SheetMatrix>;                 // 含 header 列
  appendRow(values: CellValue[]): Promise<void>;
  updateCells(updates: CellUpdate[]): Promise<void>;
  url(): string;
}

export type CellUpdate = {
  rowNumber: number;      // 1-based，含 header 的實際列號
  columnIndex: number;    // 0-based
  value: CellValue;
};
```

- `GoogleSheetsGateway`：用 `googleapis` 實作，建構子吃 `keyFile`、`spreadsheetId`、`tabName`。
- 測試用 `FakeSheetsGateway`：記憶體矩陣，實作同一介面。

### 4.2 `lib/sheets/mapping.ts`（純函式，主要測試對象）

- `SHEET_HEADERS: readonly string[]`：上表順序（中繼在前）。
- `parseHeaders(matrix): { headers: string[]; indexByHeader: Record<string, number> }`：驗證必要 header 並回傳實際欄位位置。
- `matrixToRows(matrix): SheetRow[]`：驗證 header、轉型、跳過空列。
- `rowToArray(row: SheetRow): CellValue[]`：依 `SHEET_HEADERS` 輸出（setup 用）。
- `rowToArrayInHeaderOrder(row, headers): CellValue[]`：依 Sheet 實際欄位順序輸出（append 用）。
- `diffToCellUpdates(rowNumber, headers, before, after): CellUpdate[]`：只回傳變更的業務欄位，欄位位置取自 `headers`。
- `metaCellUpdates(rowNumber, headers, row): CellUpdate[]`：`_version`、`_updated_at`、`_updated_by`、`_op_id`、`_deleted`。
- `columnLetter(index): string`：0 → `A`。
- `rowsToMatrix(rows): CellValue[][]`：setup 腳本與測試用。

### 4.3 `lib/sheets/google-repository.ts`

`GoogleSheetRepository implements SheetRepository`，建構子 `(gateway: SheetsGateway)`。
稽核事件存在實例內的陣列；`audit()` 新到舊；`stale` 以該列最後一筆稽核來源判定（與 fake 相同）。
介面行為與 `FakeSheetRepository` 一致，特別是：

- `update`：重讀 → 比對 `input.version` 與 `input.baseHash` → 無變更回 `{ audit: null }` → 只寫 diff + meta → 版本 +1。
- `create` / `update` / `simulateExternal` 的寫入都先 `readAll()` 取得**實際 header 順序**；append 與 cell 寫入都依實際欄位位置，不假設固定順序。
- 每次寫入都重新讀取，因此寫入前的資料一定是最新版本；header 漂移會在任何寫入前被偵測。
- `simulateExternal`：直接改 `status` 與 `notes`，**不遞增版本**，寫入 `source: "external"`、`actor: "unknown (Sheet)"` 稽核。
- 併發：同一實例內用 promise-chain mutex 序列化 `update` / `simulateExternal` / `create`；單一 process 有效。

### 4.4 `lib/config.ts` 與 `lib/repository-factory.ts`

- `getGoogleConfig(env = process.env): GoogleConfig | null`，規則見 §2；接受注入的 env 以便測試。
- `getRepository(): SheetRepository`：Google 設定齊全回 `GoogleSheetRepository`（singleton），否則回 `FakeSheetRepository(getStore())`。
- `getRepositoryMode(): "google" | "fake"`。
- `resetRepositoryForTests()` 供測試重建。

Route handlers 與 `app/page.tsx` 改呼叫 `getRepository()`，不再直接 `new FakeSheetRepository`。

## 5. 錯誤處理

| 情況 | 錯誤 | HTTP |
|---|---|---|
| 401/403 | `SHEET_UNAUTHORIZED`（提示分享 Sheet 給 SA email） | 502 |
| 404 | `SHEET_NOT_FOUND`（spreadsheet 或分頁不存在） | 502 |
| 429 | `SHEET_RATE_LIMIT`（請稍後重試） | 502 |
| 其他 API 失敗 | `SHEET_ERROR` | 502 |
| header 缺欄位 | `SCHEMA_DRIFT`（列出缺少欄位） | 502 |
| 設定不完整 | `CONFIG_ERROR` | 500（啟動時即失敗） |

前端沿用既有 notice 顯示 `error.message`；不新增 toast 系統。

## 6. Setup 與驗證腳本

`scripts/setup-sheet.mjs`（`npm run sheets:setup`，以 `node --env-file=.env.local` 執行）：

1. 檢查 `GOOGLE_SA_KEY_FILE` 存在；讀取 key 取得 SA email 並印出。
2. 若 `SHEET_SPREADSHEET_ID` 已存在且可讀 → 中止，避免重複建立。
3. 建立 spreadsheet「Sheets Console POC」，分頁 `Projects`。
4. 寫入 header 與 20 筆範例列（`_version = 1`、`_row_id` 為 UUID）。
5. 若設了 `SHEET_SHARE_EMAIL`，用 Drive API 以 `writer` 分享。
6. 將 `SHEET_SPREADSHEET_ID` upsert 到 `.env.local`（保留其他行）。
7. 印出 Sheet URL 與後續指令。

`scripts/verify-sheet.mjs`（`npm run sheets:verify`）：讀取並印出模式、分頁、列數、header 是否完整、SA email、URL；失敗時以非 0 結束。

## 7. UI 調整

- Header 資料來源文字由 `getRepositoryMode()` 決定：`Google Sheet` / `Fake Sheets`。
- 新增「重新載入」按鈕（呼叫既有 `api.rows()`），讓直接改 Sheet 的內容可手動同步。
- 「模擬外部修改」保留，會真的寫入 Sheet 且不遞增版本。

## 8. 測試策略

不需要憑證或網路：

1. `tests/sheet-mapping.test.ts`：header 順序不同、缺欄位、空列、數字／布林轉型、`columnLetter`、只寫變更欄位。
2. `tests/google-repository.test.ts`：以 `FakeSheetsGateway` 驗證 create/append、update 只寫變更欄位與 meta、版本衝突、hash 衝突、無變更、外部修改不遞增版本、稽核順序、stale、兩個併發更新只有一個成功。
3. `tests/config.test.ts`：無設定回 null、部分設定丟錯、完整設定回傳。
4. 既有 48 個測試維持全綠（fake 模式）。

真實連線由 `sheets:verify` 與手動驗收負責；無法在 CI 執行。

## 9. 驗收清單

- [ ] `npm test`、`npm run typecheck`、`npm run build` 通過。
- [ ] 無 `.env.local` 時仍以 fake 模式啟動，畫面標示 `Fake Sheets`。
- [ ] 設定齊全時畫面標示 `Google Sheet`，列數與 Sheet 一致。
- [ ] UI 新增一列 → Sheet 出現該列，`_row_id`/`_version` 正確。
- [ ] UI 編輯 → 只有變更欄位與 meta 被更新，版本 +1。
- [ ] 直接改 Sheet → 按「重新載入」看到新值。
- [ ] 編輯期間直接改 Sheet → 儲存得 409，衝突視窗可保留我的或 Sheet。
- [ ] 缺少 header → 顯示 `SCHEMA_DRIFT`，不寫入。
- [ ] `secrets/` 與 `.env.local` 不在 git 中。

## 10. 已知限制

- 稽核事件只存在記憶體，重啟後消失；衝突判定仍靠 Sheet 上的 `_version` + hash，不受影響。
- 直接改 Sheet 不會主動產生 stale 標記，也不會有 external 稽核；只有「模擬外部修改」會。偵測發生在下次儲存（409）。
- 沒有輪詢；需要手動「重新載入」。
- mutex 只在單一 process 內有效；多實例需 Postgres advisory lock。
- 只支援一個固定 schema 的分頁。
