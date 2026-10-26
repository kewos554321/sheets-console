# Sheets Console

以 Google Sheets 為資料來源的結構化資料錄入 Web UI。

- 多人使用與角色權限（admin / editor / viewer）
- 每一筆修改可回追（誰、何時、從哪裡、改了什麼）
- 有人直接修改 Google Sheet 時，近即時同步回 UI 並顯示衝突
- 部署：Vercel + GitHub

## 狀態

設計審閱中，尚未開始實作。

完整設計、風險登記表與分階段計畫見 [PLAN.md](./PLAN.md)。

## 技術方向

| 層 | 選擇 |
|---|---|
| 前端/後端 | Next.js（App Router）+ TypeScript |
| UI | shadcn/ui + TanStack Table |
| 驗證 | zod |
| DB | Postgres（Neon / Supabase）+ Drizzle |
| 登入 | Auth.js（Google） |
| 資料存取 | Google Sheets API（Service Account） |
| 部署 | Vercel + GitHub |

## 下一步

1. 審閱 `PLAN.md`，確認待決事項
2. 產出逐任務實作計畫
3. Sprint 0：Google Sheets API 與外部修改偵測的技術驗證
