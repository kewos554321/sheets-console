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

刻意不做：登入與角色、真實 Google Sheets adapter、Postgres/Drizzle、Apps Script/webhook、
輪詢同步、快照與回滾、刪除。完整範圍見設計文件。

> ⚠️ 資料存在單一 process 的記憶體，重啟即重置，**不可部署到 Vercel 當正式服務**。
> 這個 POC 只在本機驗證產品流程。

## 快速開始

```bash
npm install
npm run dev        # http://localhost:3000
```

其他指令：

```bash
npm test           # Vitest 單元與 API 測試
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

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
| 資料層 | `SheetRepository` + in-memory fake | Google Sheets adapter |
| 控制層 | 記憶體（版本、稽核） | Postgres（Neon / Supabase）+ Drizzle |
| 登入 | 無（固定 demo 身分） | Auth.js（Google） |
| 部署 | 本機 | Vercel + GitHub |
