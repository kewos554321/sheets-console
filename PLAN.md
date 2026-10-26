# Sheets Console — 產品設計與導入計畫

> 日期：2026-10-26
> 狀態：待審閱（設計階段，尚未開始實作）
> 部署：Vercel + GitHub
> 資料來源：Google Sheets（單一團隊）

---

## 1. 背景與目標

建立一個 Web UI，讓團隊以「結構化資料錄入」的方式操作 Google Sheets，並具備：

1. 表格瀏覽、搜尋、篩選、新增、編輯、刪除
2. 多人使用與角色權限
3. 每一筆修改可回追：誰、何時、從哪個來源、改了什麼
4. 有人直接修改 Google Sheet 時，UI 能近即時反映
5. 可部署在 Vercel，程式碼以 GitHub 版控

### 成功標準

| 指標 | 目標 |
|---|---|
| UI 讀取 p95 | < 1.5 秒（1000 列以內） |
| 外部直接修改反映到 UI | p95 < 60 秒 |
| 無聲 lost update | 0 件（衝突必須被顯示） |
| UI 寫入稽核覆蓋率 | 100% |
| 還原演練 | 30 分鐘內完成 |
| 非授權使用者寫入 | 0 件 |

---

## 2. 已確認的決策

| 項目 | 決策 | 理由 |
|---|---|---|
| 資料來源 | Google Sheets | 原生協作、權限、版本，省去自建協作 |
| UI 型態 | 結構化表格 + 表單 | 欄位固定，可做驗證與稽核；不做完整試算表編輯器 |
| 使用範圍 | 單一團隊 | 先驗證流程，不做多租戶 |
| 外部修改 | 近即時同步 | 使用 `onChange` 通知 + 輪詢對帳 |
| 架構 | Sheet 為真實來源，Postgres 為控制層 | 保留 Sheet 協作價值，同時補上權限與稽核 |
| 資料存取 | Service Account | 避開每位使用者的 OAuth token 過期與驗證流程 |
| 登入 | Google 登入（僅身份） | 授權由應用程式角色控制 |
| 初始資料 | 新開 Sheet | 從第一天就有 `_row_id`、`_version` 等中繼欄位 |

---

## 3. 非目標（MVP 不做）

- 完整試算表編輯器（任意儲存格、公式編輯、格式工具）
- 多租戶 SaaS、計費、自助註冊
- 離線編輯與原生手機 App
- 附件上傳、簽核流程、通知中心
- 以 Google Sheets 版本紀錄當作主要稽核來源
- 取代 Google Sheet 既有的樞紐分析與圖表

> 這些不是永遠不做，而是等 MVP 驗證後再評估。

---

## 4. 架構

```text
┌─────────────────────────────────────────────┐
│  Browser (Next.js + TanStack Table + zod)   │
│  表格 / 表單 / 差異檢視 / 歷史紀錄           │
└───────────────┬─────────────────────────────┘
                │ HTTPS (session cookie)
┌───────────────▼─────────────────────────────┐
│  Vercel: Next.js Route Handlers / RSC        │
│  auth → 權限 → schema 驗證 → optimistic lock │
└──────┬───────────────────────┬──────────────┘
       │                       │
┌──────▼─────────┐   ┌─────────▼─────────────┐
│ Postgres       │   │ SheetRepository (port)│
│ 使用者/角色     │   ├──────────┬────────────┤
│ 稽核/outbox    │   │ Google   │ In-memory  │
│ 同步狀態/衝突   │   │ adapter  │ fake(測試)  │
│ 快照           │   └────┬─────┴────────────┘
└──────┬─────────┘        │
       │           ┌──────▼──────────┐
       │           │ Google Sheets   │
       │           │ (真實資料)       │
       │           └──────┬──────────┘
       │                  │ onChange
       │           ┌──────▼──────────┐
       └──────────►│ Apps Script     │
          webhook  │ 或 Drive watch  │
                   └─────────────────┘
```

### 技術選型

| 層 | 選擇 | 備註 |
|---|---|---|
| 前端/後端 | Next.js（App Router）+ TypeScript | 與 Vercel 原生契合 |
| UI | shadcn/ui + TanStack Table | 表格、篩選、分頁 |
| 表單/驗證 | react-hook-form + zod | 與後端共用 schema |
| ORM | Drizzle | 輕量、migration 明確 |
| DB | Neon 或 Supabase Postgres | Vercel Marketplace 可直接接 |
| 登入 | Auth.js（Google provider） | 只用 openid/email/profile |
| Google 資料 | Service Account + Sheets API | Sheet 分享給 SA email |
| 排程 | Vercel Cron（Pro）或 Supabase pg_cron | Hobby 的 Cron 一天一次，不足 |
| 佇列/重試 | Postgres outbox + cron | MVP 不引入額外服務 |
| 錯誤追蹤 | Sentry | 免費方案足夠 |
| 測試 | Vitest + Playwright | fake repository + 專用測試 Sheet |

### 元件責任

| 元件 | 只負責 | 不負責 |
|---|---|---|
| UI | 呈現、輸入驗證、顯示衝突 | 直接呼叫 Google API |
| Route Handler | 授權、schema 驗證、交易邊界 | 長期背景工作 |
| Postgres | 身份、權限、稽核、outbox、同步游標、快照 | 業務資料本體 |
| `SheetRepository` | 讀寫 Sheet、批次操作、version/hash | 權限、稽核 |
| Sync Worker | 偵測外部變更、對帳、重試 | 決定誰能看到什麼 |
| Apps Script | 偵測人手修改並通知 | 業務邏輯 |

### 為什麼用 Service Account

- 使用者只透過 Google 登入證明身份，**不需要授予 Sheets 權限**。
- 應用程式用一組 SA 讀寫指定 Sheet，權限由 app 的 role 控制。
- 避開 OAuth 測試模式 refresh token 7 天過期、Google OAuth 驗證、每位使用者逐一授權。
- 代價：Google Sheet 的共享權限與 app 權限是兩套，必須靠流程對齊（見風險 R5）。

---

## 5. 資料模型

```text
users
  id, google_sub, email, name, role(admin|editor|viewer), is_active, created_at

sheet_configs
  id, spreadsheet_id, tab_name, schema_key, schema_version,
  header_row, last_synced_at, sync_cursor, is_active

row_index
  sheet_id, row_id, row_number, version, content_hash, last_seen_at,
  is_deleted, PRIMARY KEY(sheet_id, row_id)

audit_events
  id, sheet_id, row_id, actor_user_id, actor_label,
  source(ui|external|system), action(create|update|delete|revert),
  before_json, after_json, diff_json,
  op_id, request_id, created_at

outbox
  id, op_id, sheet_id, row_id, payload, status(pending|sent|failed),
  attempts, next_retry_at, last_error, created_at

conflicts
  id, sheet_id, row_id, base_version, ui_payload, sheet_payload,
  status(open|resolved_ui|resolved_sheet|merged), resolved_by, resolved_at

snapshots
  id, sheet_id, taken_at, storage_key, row_count

webhook_events
  id, delivery_id, received_at, processed_at
```

`row_index` 是效能關鍵：UI 不掃整張 Sheet，而是用 Postgres 索引與 hash 做衝突比對；Sheet 仍是最終真實來源。

---

## 6. Sheet 上的中繼欄位

每個由系統管理的分頁，固定包含：

| 欄位 | 用途 |
|---|---|
| `_row_id` | UUID，穩定識別，列號位移不影響 |
| `_version` | 整數，每次成功寫入 +1 |
| `_updated_at` | ISO 8601 UTC |
| `_updated_by` | UI email 或 Sheet 編輯者 email |
| `_op_id` | 最後一次寫入的操作 ID，用於抑制回音 |
| `_deleted` | 軟刪除旗標，保留稽核對應 |

規則：

1. 所有欄位對應**以 header 名稱**為準，不以欄位索引。
2. `_row_id` 重複（整列複製）視為資料錯誤，同步時標記衝突。
3. 計算欄位（公式）在 UI 唯讀，永不寫入。
4. 中繼欄位建議隱藏並加保護範圍，但**不能視為安全邊界**（擁有者可解除）。

---

## 7. 核心流程

### 7.1 讀取

1. 使用者開啟頁面 → 檢查 session 與 role。
2. 從 `row_index` 分頁查詢（搜尋、篩選、排序）。
3. 需要完整內容時，用 `values.batchGet` 依 `row_id` 取回。
4. 顯示 `last_synced_at` 與同步狀態。

### 7.2 UI 寫入（write-through）

```text
1. 使用者送出表單
2. zod 驗證 + 欄位權限檢查
3. 取得該列 Postgres advisory lock（key = hash(sheet_id,row_id)）
4. 比對 client 帶來的 _version 與 row_index.version
   - 不一致 → 409，回傳差異，進入衝突流程
5. 產生 op_id，寫入 audit_events(status=pending) + outbox（同一 DB 交易）
6. 呼叫 Sheets API，只更新目標列的目標欄位
7. 成功 → 更新 row_index（version+1、content_hash）→ audit=applied → outbox=sent
   失敗 → audit=failed、outbox 重試；UI 顯示「未完成」，不顯示成功
8. 釋放 lock
```

要點：

- **不跨越 Google 與 Postgres 開交易**，改用 outbox + 冪等重放。
- 每次寫入只動必要的欄位，避免覆蓋公式、格式、資料驗證。
- 成功定義：Sheet 寫入成功 **且** DB 狀態更新成功。任何一邊失敗都要可見。

### 7.3 外部直接修改偵測

三層防線：

1. **Apps Script（主要）**：安裝式 `onChange`（`changeType=EDIT`）→ 計算 HMAC → POST 到 `/api/webhooks/sheets`。Handler 立即回應 200，實際比對交給 worker。
2. **輪詢對帳（必要）**：每 1 分鐘讀取受管理分頁的 `_row_id`、`_version`、`content_hash` 欄位，找出差異。
3. **寫入前檢查（最後防線）**：UI 寫入前重讀該列 hash；不一致就阻擋。

判定邏輯：

```text
current_hash = hash(該列受管理欄位)
if current_hash == row_index.content_hash:
    → 無變更（或自己的寫入已套用）
elif current_hash == outbox 預期寫入後的 hash and _op_id matches:
    → 自己的寫入，抑制，不產生 external 事件
else:
    → 外部變更：寫入 audit(source=external)，更新 row_index，
      若同時有未解決的 UI 版本 → 建立 conflict
```

> 重點：**API 寫入通常不會觸發 `onEdit`**，且 `onChange` 的行為需在 Spike 實測確認；這就是為什麼輪詢對帳不能省。

### 7.4 衝突處理

- 情境：A 在 UI 修改、B 直接在 Sheet 修改同一列。
- 系統**不自動合併**，顯示三欄差異：基準版本、我的版本、Sheet 目前版本。
- 使用者選擇：保留我的、保留 Sheet、逐欄合併。
- 合併後以新的 `_version` 寫回，並產生 `action=merge` 的稽核事件。
- 外部修改若無 `_version` 遞增，仍可用 hash 判定，不依賴對方遵守規則。

### 7.5 稽核與回滾

- 每一次 UI 寫入、每一次偵測到的外部修改，都產生 `audit_events`。
- `diff_json` 只存變更欄位的前後值，不存整列，降低體積。
- 直接改 Sheet 的 `actor`：
  - Apps Script 可取得 `Session.getActiveUser().getEmail()`；取不到時記為 `unknown (Sheet)`。
  - 不宣稱這是合規等級稽核。
- 回滾 = 套用反向 patch 並產生**新的**稽核事件，不修改歷史。
- 保留期限：2 年（可設定），可匯出 CSV。

### 7.6 刪除

- UI 刪除採軟刪除：`_deleted=true`、`_version+1`，列保留。
- 定期（例如每季）由管理員執行歸檔，將已刪除列搬到 `_archive` 分頁。
- 不直接刪除列，避免列號位移與稽核斷鏈。

---

## 8. 同步與 Webhook 安全

| 項目 | 做法 |
|---|---|
| 簽章 | HMAC-SHA256(secret, timestamp + body)，secret 存 Apps Script Script Properties 與 Vercel env |
| 重放 | timestamp 誤差 > 5 分鐘拒絕；`delivery_id` 去重 |
| 驗證 | 常數時間比較；失敗回 401 並記錄 |
| 限流 | 每來源每分鐘上限；超量丟棄並告警 |
| 觸發器維護 | 部署腳本檢查 `onChange` 是否存在；遺失時告警 |
| 輪詢 | 1 分鐘（Pro）或 pg_cron；與 webhook 互為備援 |
| 同步游標 | 記錄最後成功時間與最後處理的 row hash |

> Apps Script 的來源 IP 不穩定，**不要用 IP allowlist 當主要防線**，以 HMAC 為準。

---

## 9. 權限模型

| 角色 | 讀取 | 新增/編輯 | 刪除 | 歷史 | 設定 |
|---|---|---|---|---|---|
| viewer | ✅ | ❌ | ❌ | 自己的 | ❌ |
| editor | ✅ | ✅ | ❌ | ✅ | ❌ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |

- 登入後檢查 email allowlist 或 Google Workspace domain。
- 所有 API 在 Route Handler 再檢查一次，不依賴前端隱藏按鈕。
- Sheet 共享對象僅限：Service Account、少數管理員。禁止「知道連結即可編輯」。
- 每季執行一次 Google Drive 權限審查（可用 Drive API 列出 permissions）。

---

## 10. 錯誤處理與一致性

| 失敗點 | 行為 |
|---|---|
| Sheets API 429/5xx | 指數退避 + jitter，outbox 重試，最多 5 次 |
| Sheet 寫入成功、DB 更新失敗 | outbox 保持 pending，對帳 job 以 `_op_id` 修正 DB |
| DB 寫入成功、Sheet 寫入失敗 | audit=failed，UI 顯示失敗，提供重試 |
| 同步中途失敗 | 記錄 cursor，不前進；下一輪重跑（冪等） |
| Schema drift | 停止該分頁同步，UI 顯示錯誤 banner，告警 |
| 大量刪除 | 超過閾值（例如 10 列）要求二次確認，並先建立快照 |

---

## 11. 部署（Vercel + GitHub）

### 一次性設定

1. GitHub repo（private）+ `main` 保護規則。
2. Vercel 專案連結 repo；Preview / Production 環境分離。
3. Neon 或 Supabase 建立 Postgres；連線字串放 Vercel env。
4. Google Cloud：
   - 啟用 Sheets API、Drive API
   - 建立 Service Account，下載 JSON key（只放 Vercel env，不入 repo）
   - 建立目標 Spreadsheet，分享給 SA email（Editor）
5. Google OAuth Client（僅登入用），redirect URI 指向 Vercel 網域。
6. Apps Script 綁定該 Spreadsheet，安裝 `onChange` trigger，secret 存 Script Properties。
7. 設定環境變數：`DATABASE_URL`、`GOOGLE_SA_KEY`、`AUTH_SECRET`、`GOOGLE_CLIENT_ID/SECRET`、`SHEETS_WEBHOOK_SECRET`、`ALLOWED_EMAILS/DOMAIN`。

### CI/CD

- GitHub Actions：lint、typecheck、unit test、migration 檢查。
- PR → Vercel Preview；合併 `main` → Production。
- Migration 以獨立 job 執行，不放在 build。
- Production 部署後跑 smoke test（登入、讀取、寫入測試列後刪除）。

### 環境

| 環境 | Sheet | DB |
|---|---|---|
| local | 專用 test spreadsheet | 本機 Postgres 或 Neon branch |
| preview | 專用 test spreadsheet | Neon branch |
| production | 正式 spreadsheet | 正式 DB |

---

## 12. 測試策略

| 層級 | 內容 |
|---|---|
| 單元 | 驗證規則、diff 計算、hash、衝突判定、權限 |
| 整合 | `SheetRepository` 的 Google adapter 打 test spreadsheet；outbox 重試；webhook 簽章 |
| E2E | Playwright：登入 → 新增 → 編輯 → 直接改 Sheet → 看到外部變更 → 衝突 → 回滾 |
| 契約 | 用 fake repository 跑同一套測試，確保 adapter 行為一致 |
| 還原演練 | 每季從 snapshot 還原到 test spreadsheet |

必測案例：

1. 兩人同時改同一列 → 必須出現衝突，不得覆蓋。
2. UI 寫入後 webhook 回音 → 不得誤判為外部修改。
3. 直接改 Sheet → 60 秒內 UI 更新。
4. 插入/刪除列 → `_row_id` 仍正確對應。
5. 改欄位名稱 → 同步停止並告警。
6. 重複 `_row_id` → 標記衝突。
7. 429 → 重試後成功，無重複寫入。
8. viewer 直接打 API → 403。

---

## 13. 分階段實作計畫

> 以單人、每週 3-4 個工作天估算，總計約 20-25 個工作天。

### Sprint 0：技術驗證（2 天）

- 建立 Google Cloud 專案、SA、test spreadsheet
- POC：讀取、批次寫入、`_row_id`/`_version`、手動修改偵測
- 比較 `onChange` webhook 與 Drive `changes.watch` 的延遲與可靠度
- 量測 API 配額與 1000 列讀寫耗时

**驗收**：手動改一格 → 60 秒內被偵測；UI 寫入不被誤判為外部變更。

### Sprint 1：骨架與唯讀（4 天）

- Next.js、GitHub、Vercel、Neon、Drizzle、Auth.js
- email allowlist、角色表
- `sheet_configs`、`row_index`、唯讀表格（分頁/搜尋/篩選）
- `SheetRepository` + fake

**驗收**：非 allowlist 無法登入；1000 列載入 p95 < 1.5 秒；單元測試通過。

### Sprint 2：寫入與稽核（6 天）

- zod schema、表單、新增/編輯
- optimistic lock、advisory lock、outbox
- `audit_events`、差異檢視、個人歷史

**驗收**：編輯成功後 Sheet 與稽核一致；併發編輯回 409；失敗可見且可重試。

### Sprint 3：同步與衝突（6 天）

- Apps Script `onChange` + HMAC webhook
- 1 分鐘輪詢對帳、回音抑制
- 外部變更 audit、衝突 UI、回滾
- 同步狀態顯示

**驗收**：直接改 Sheet 60 秒內反映；衝突不自動覆蓋；回滾產生新事件。

### Sprint 4：權限、維運、上線（4 天）

- admin/editor/viewer 完整權限
- 保護範圍與 header 驗證腳本
- 每日快照、還原 runbook
- Sentry、告警、限流
- Playwright E2E、smoke test

**驗收**：viewer 無法寫入；還原演練成功；告警可送達；上線檢查表完成。

---

## 14. 風險登記表

> 嚴重度 = 影響 × 機率。P0 必須在 MVP 前解決；P1 上線前有緩解方案；P2 接受並監控。

### R1. 直接修改 Sheet 無法可靠同步回 UI（P0）

- **情境**：有人在 Google Sheet 改資料，UI 仍顯示舊值；或系統誤判覆盖對方修改。
- **原因**：Sheets 沒有列級 webhook；`onChange` 可能延遲；API 寫入不觸發 `onEdit`；輪詢受配額限制；Apps Script trigger 可能被移除。
- **緩解**：
  - `onChange` + 1 分鐘輪詢雙軌
  - 以 content hash 判定，不依賴對方遞增 `_version`
  - 寫入前重讀該列，衝突就 409
  - UI 明確顯示「最後同步時間」與 stale 狀態
  - 監控告警：同步延遲 > 5 分鐘
- **殘餘風險**：延遲期間的短暫不一致；需以衝突流程處理，不承諾即時。

### R2. 同時修改造成 lost update（P0）

- **情境**：兩人幾乎同時改同一列，後寫入者覆蓋前者。
- **緩解**：`_version` + hash 樂觀鎖、Postgres advisory lock、`op_id` 冪等、409 差異畫面。
- **殘餘風險**：外部修改者不遵守版本規則；靠 hash 與寫入前重讀補救。

### R3. 雙寫不一致（P0）

- **情境**：Sheet 寫成功但 DB 失敗，或反之，導致 UI 與稽核不一致。
- **緩解**：outbox-first、狀態機（pending/sent/failed）、冪等重放、對帳 job、UI 不提前顯示成功。
- **殘餘風險**：需要人工處理的卡住項目；提供 admin 修復介面。

### R4. 稽核不完整或不可信（P0）

- **情境**：直接改 Sheet 的人無法識別，或可規避稽核。
- **原因**：Google Sheets 版本紀錄沒有可逐筆匯出的 API；`getActiveUser()` 可能拿不到 email；擁有者可繞過保護範圍。
- **緩解**：自己存 audit、external 事件標記 `unknown`、保護中繼欄位、限制 Sheet 共享、文件化「非合規等級」。
- **殘餘風險**：無法百分之百證明「誰」改了 Sheet；若需強稽核，應改走架構 B。

### R5. 權限邊界被 Sheet 共享繞過（P0）

- **情境**：有人拿到 Sheet 連結直接改，繞過 UI 權限與驗證。
- **緩解**：Sheet 只分享給 SA 與少數 admin；禁止連結共享；每季權限審查；保護範圍；異常變更告警。
- **殘餘風險**：admin 仍可繞過；這是產品設計上的取捨。

### R6. Schema drift（P1）

- **情境**：有人改欄名、插入欄、刪欄，UI 對錯欄位或崩潰。
- **緩解**：以 header 名稱映射、每次同步驗證 header、`schema_version`、drift 時停止同步並顯示 banner、告警。

### R7. 公式、格式、資料驗證被破壞（P1）

- **情境**：寫入時覆蓋公式、格式、下拉選單。
- **緩解**：只寫目標欄位、計算欄位唯讀、使用 `values.batchUpdate` 而非整列覆寫、寫入前快照、整合測試檢查格式。

### R8. 列號位移（P1）

- **情境**：插入/刪除列後寫錯列。
- **緩解**：`_row_id` 穩定識別、每次同步重建 `row_number`、不以列號當 key、軟刪除。

### R9. Google API 配額與 429（P1）

- **情境**：輪詢 + 多人使用觸發限流，同步停擺。
- **緩解**：batchGet/batchUpdate、指數退避、增量同步、快取、配額監控、必要時降低輪詢頻率。
- **注意**：實際配額以 Cloud Console 為準（專案與每使用者皆有每分鐘上限）。

### R10. Vercel 執行限制（P1）

- **情境**：同步工作逾時、Cron 頻率不足、冷啟動。
- **緩解**：Handler 短、重工作拆成冪等 job、`maxDuration` 內完成、外部排程（pg_cron/QStash）、DB 與函式選同區。
- **成本**：近即時輪詢在 Hobby 不可行，需 Vercel Pro 或外部排程。

### R11. Service Account key 洩漏（P1）

- **情境**：key 進 repo 或被竊，整個 Sheet 可被讀寫。
- **緩解**：只放 Vercel env、least privilege（只分享目標 Sheet）、定期輪替、GitHub secret scanning、異常存取告警。

### R12. Webhook 偽造或重放（P1）

- **緩解**：HMAC、timestamp、delivery_id 去重、常數時間比較、限流、失敗告警。
- **注意**：Apps Script IP 不固定，不能只靠 IP allowlist。

### R13. Google Sheets 不適合當資料庫（P1）

- **限制**：無交易、無外鍵、10 百萬儲存格上限、全表讀取慢。
- **緩解**：每分頁上限（例如 5 萬列）、分頁與歸檔、Postgres 投影、避免跨表 join。
- **觸發遷移**：列數或併發超過閾值時，評估架構 B。

### R14. 誤刪或大量覆蓋（P1）

- **緩解**：軟刪除、每日快照、保留 90 天、還原 runbook、大量變更二次確認。
- **注意**：Google 版本紀錄保留有限，不能當唯一備份。

### R15. UI 顯示成功但實際未同步（P1）

- **緩解**：每列狀態（pending/synced/failed）、樂觀更新後校正、失敗 toast + 重試、禁止在 pending 時重複送出。

### R16. 測試污染正式資料（P2）

- **緩解**：環境分離、專用 test spreadsheet、CI 不持有 production key、測試資料自動清理。

### R17. 成本超預算（P2）

- **估算**：Vercel Pro $20/月、Neon $0-19/月、Sentry $0、Google API 免費額度內，合計約 $20-40/月。
- **緩解**：依實際用量調整輪詢頻率與方案。

### R18. 隱私與合規（P2，若含個資則升為 P0）

- **緩解**：資料分區、存取紀錄、保留政策、日誌不落 PII、與 Google/Neon 的 DPA。

### R19. 廠商鎖定與 bus factor（P2）

- **緩解**：`SheetRepository` 介面、匯出功能、文件化 runbook、避免冷門套件。

### R20. 同步回音造成無限迴圈（P2）

- **情境**：UI 寫入 → webhook → 誤判外部 → 再寫入。
- **緩解**：`_op_id` 與 hash 抑制、webhook 只通知不寫入、對帳以 hash 為準。

---

## 15. 成本估算

| 項目 | 月費（USD） | 備註 |
|---|---|---|
| Vercel Pro | 20 | 需要 1 分鐘 Cron；Hobby 一天一次 |
| Neon / Supabase | 0-19 | 免費方案可起步 |
| Google Cloud | 0 | Sheets/Drive API 免費額度內 |
| Sentry | 0 | 免費方案 |
| 網域 | 1-2 | 選用 |
| **合計** | **約 20-41** | 不含人力 |

替代方案：Vercel Hobby + Supabase pg_cron，可壓到 $0-19，但維運複雜度略高。

---

## 16. 監控與維運

| 指標 | 告警條件 |
|---|---|
| 同步延遲 | > 5 分鐘 |
| outbox 失敗 | 連續 3 次 |
| 429 次數 | 5 分鐘內 > 10 |
| Webhook 簽章失敗 | 任何一次 |
| Schema drift | 立即 |
| API 5xx | > 1% |
| 還原演練 | 每季一次 |

Runbook 必備：SA key 輪替、trigger 重建、outbox 卡住處理、快照還原、權限審查。

---

## 17. 待決事項

1. Google 帳號是個人 Gmail 還是 Workspace？（影響 `getActiveUser()` 與 allowlist 設計）
2. Sheet 內是否含個資或敏感資料？（影響合規與是否改走架構 B）
3. 預估列數與同時使用人數？
4. 除了 UI，是否還有人需要直接看 Sheet 做樞紐/圖表？
5. 刪除權限要給到哪個角色？
6. 稽核保留年限？
7. 是否接受「直接改 Sheet 是 break-glass，不保證即時」？
8. 是否需要中文/英文介面？

---

## 18. 上線檢查表

- [ ] SA key 只存在 Vercel env，repo 無洩漏
- [ ] Sheet 共享僅限 SA 與 admin
- [ ] `onChange` trigger 存在且簽章正確
- [ ] 輪詢 cron 正常，同步延遲告警已測
- [ ] 三種角色權限測試通過
- [ ] 併發衝突與回滾 E2E 通過
- [ ] 快照與還原演練完成
- [ ] 錯誤追蹤與告警可送達
- [ ] 隱私與保留政策文件化
- [ ] 使用者操作說明與 break-glass 流程

---

## 19. 下一步

1. 審閱本文件，確認架構、風險接受度與待決事項。
2. 依回饋修訂。
3. 產出逐任務實作計畫（含檔案結構、API 契約、資料表 migration、測試案例）。
4. 初始化 GitHub repo 與 Sprint 0 技術驗證。
