# Sheets Console

以 Google Sheets 為資料來源的結構化資料錄入 Web UI。

- 多人使用與角色權限（admin / editor / viewer）
- 每一筆修改可回追（誰、何時、從哪裡、改了什麼）
- 有人直接修改 Google Sheet 時，近即時同步回 UI 並顯示衝突
- 部署：Vercel + GitHub

## 目前狀態：最小 POC

這是一個**可點擊的垂直切片**，用記憶體中的 fake repository 驗證核心流程，尚未接上 Google Sheets：

- ✅ 表格瀏覽、搜尋、狀態篩選、排序、分頁（1000 列種子資料）
- ✅ 新增／編輯表單，zod 前後端共用驗證
- ✅ `_version` + content hash 樂觀鎖，衝突回 409，不無聲覆蓋
- ✅ 三欄衝突視窗（基準／我的／Sheet 目前），可保留我的或保留 Sheet
- ✅ 每一次寫入都有稽核事件與欄位級 diff
- ✅ 一鍵模擬「有人在 Sheet 直接修改」，會標記 stale 並在儲存時觸發衝突
- ✅ 可切換成真實 Google Sheets（Service Account），見下方設定

刻意不做：登入與角色、Postgres/Drizzle 稽核、Apps Script/webhook、輪詢同步、快照與回滾、刪除。
Google Sheets 可透過 Service Account 直連，但稽核事件仍只存在記憶體（重啟即失）。

> ⚠️ 資料存在單一 process 的記憶體，重啟即重置，**不可部署到 Vercel 當正式服務**。
> 這個 POC 只在本機驗證產品流程。

## 快速開始

```bash
npm install
npm run dev        # http://localhost:3000
```

沒有 `.env.local` 時會以 fake 模式啟動（記憶體資料）。

其他指令：

```bash
npm test           # Vitest 單元與 API 測試
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run sheets:setup   # 初始化 Google Sheet（header + 範例列）
npm run sheets:verify  # 驗證 Google Sheets 連線與 schema
```

## 接到你的 Google Sheet

### 1. 建立 Service Account

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立專案。
2. **APIs & Services → Library** 啟用 **Google Sheets API** 與 **Google Drive API**。
3. **IAM & Admin → Service Accounts** 建立一個 Service Account。
4. 進入該帳號 → **Keys → Add key → Create new key → JSON** 下載。
5. 把 JSON 放到 `secrets/sa.json`。
6. 打開 JSON 找 `client_email`，把該 email 加到你 Sheet 的「共用」，權限設為 **編輯者**。

`secrets/` 與 `.env.local` 都不會被 commit。

### 2. 設定環境變數

```bash
cp .env.example .env.local
```

編輯 `.env.local`，至少要有：

```bash
GOOGLE_SA_KEY_FILE=./secrets/sa.json
SHEET_SPREADSHEET_ID=<你的 spreadsheet ID>
SHEET_TAB_NAME=<分頁名稱>
```

也可以只填 key 與既有 Sheet 的 ID，分頁名稱留給 setup 腳本自動偵測。

### 3. 初始化與驗證

```bash
npm run sheets:setup   # 空白分頁會寫入 header + 20 筆範例列
npm run sheets:verify  # 檢查連線、header、列數
npm run dev
```

`sheets:setup` 遇到已有資料的分頁會中止，不會覆蓋。若分頁不存在但整張表只有一個分頁，會自動使用該分頁名稱並寫回 `.env.local`。

啟動後 Header 會顯示 `Google Sheet`；沒有設定時顯示 `Fake Sheets`。直接改 Google Sheet 後，按 UI 的「重新載入」即可看到最新資料。

## 五步驟示範

1. 點選一列 → 右側看到稽核紀錄；按列上的「編輯」修改狀態。
2. 在編輯視窗內按「模擬外部修改」（不用關閉表單；右上角按鈕在關閉表單後也可用）。
3. 按「儲存」→ 出現三欄衝突視窗，原始資料沒有被覆蓋。
4. 選「保留我的」→ 寫入成功，稽核出現 `resolve_conflict`，stale 標記消失。
5. 再試一次並選「保留 Sheet」→ 回到 Sheet 的值，且不產生新寫入。

## 文件

- 產品設計與風險登記表：[PLAN.md](./PLAN.md)
- POC 設計規格：[docs/superpowers/specs/2026-10-26-sheets-console-poc-design.md](./docs/superpowers/specs/2026-10-26-sheets-console-poc-design.md)
- 實作計畫：[docs/superpowers/plans/2026-10-26-sheets-console-poc.md](./docs/superpowers/plans/2026-10-26-sheets-console-poc.md)

## 技術方向

| 層 | POC | 正式目標 |
|---|---|---|
| 前端/後端 | Next.js App Router + TypeScript | 同左 |
| UI | Tailwind CSS + TanStack Table | shadcn/ui + TanStack Table |
| 驗證 | zod（前後端共用） | 同左 |
| 資料層 | `SheetRepository` + in-memory fake / Google Sheets adapter | Google Sheets adapter |
| 控制層 | 記憶體（版本、稽核） | Postgres（Neon / Supabase）+ Drizzle |
| 登入 | 無（固定 demo 身分） | Auth.js（Google） |
| 部署 | 本機 | Vercel + GitHub |
