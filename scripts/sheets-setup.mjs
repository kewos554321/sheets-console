import { existsSync, readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import googleapis from "googleapis";

const { google } = googleapis;

const HEADERS = [
  "_row_id",
  "_version",
  "_updated_at",
  "_updated_by",
  "_op_id",
  "_deleted",
  "project_name",
  "client",
  "status",
  "owner",
  "amount",
  "notes",
];

const CLIENTS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Wonka", "Hooli"];
const OWNERS = ["Ariel", "Bo", "Chen", "Dana", "Eli", "Fang", "Gus", "Hana"];
const STATUSES = ["planning", "active", "blocked", "done"];

const keyFile = process.env.GOOGLE_SA_KEY_FILE?.trim() || "./secrets/sa.json";
let tabName = process.env.SHEET_TAB_NAME?.trim() || "Projects";
let spreadsheetId = process.env.SHEET_SPREADSHEET_ID?.trim() || "";
const shareEmail = process.env.SHEET_SHARE_EMAIL?.trim() || "";

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function quoteTab(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

function sampleRows(count = 20) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const row = {
      _row_id: crypto.randomUUID(),
      _version: 1,
      _updated_at: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
      _updated_by: "demo@example.com",
      _op_id: "seed",
      _deleted: false,
      project_name: `專案 ${String(n).padStart(3, "0")}`,
      client: CLIENTS[index % CLIENTS.length],
      status: STATUSES[index % STATUSES.length],
      owner: OWNERS[index % OWNERS.length],
      amount: 10000 + index * 500,
      notes: index % 3 === 0 ? `第 ${n} 筆示範資料` : "",
    };
    return HEADERS.map((header) => row[header]);
  });
}

function upsertEnv(path, values) {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing.split(/\r?\n/);

  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (index >= 0) lines[index] = line;
    else lines.push(line);
  }

  writeFileSync(path, `${lines.filter((line, index) => line !== "" || index < lines.length - 1).join("\n").replace(/\n+$/, "")}\n`);
}

if (!existsSync(keyFile)) {
  fail(`找不到 Service Account 金鑰：${keyFile}\n請先下載 JSON 金鑰放到該路徑，或設定 GOOGLE_SA_KEY_FILE。`);
}

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});
const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

let credentials;
try {
  credentials = await auth.getCredentials();
} catch {
  fail("無法讀取 Service Account 金鑰，請確認 JSON 檔案內容正確。");
}

const saEmail = credentials.client_email ?? "(unknown)";
console.log(`Service Account：${saEmail}`);

let created = false;

try {
  if (!spreadsheetId) {
    const createdSheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: "Sheets Console POC" },
        sheets: [{ properties: { title: tabName } }],
      },
    });
    spreadsheetId = createdSheet.data.spreadsheetId;
    created = true;
    console.log(`已建立新 Sheet：${createdSheet.data.spreadsheetUrl}`);
  } else {
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(title)",
    });
    const titles = (metadata.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter(Boolean);

    if (!titles.includes(tabName)) {
      if (titles.length === 1) {
        tabName = titles[0];
        console.log(`找不到「${process.env.SHEET_TAB_NAME ?? "Projects"}」，改用唯一分頁：${tabName}`);
      } else {
        fail(`找不到分頁「${tabName}」。現有分頁：${titles.join(", ")}\n請用 SHEET_TAB_NAME 指定。`);
      }
    }
  }

  const existingValues = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A1:AZ`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const matrix = existingValues.data.values ?? [];
  const hasData = matrix.some((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  if (hasData) {
    fail(
      `分頁「${tabName}」已有資料，為避免覆蓋已中止。\n` +
        `若確定要初始化，請先清空該分頁（或改用空白分頁）。`,
    );
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADERS, ...sampleRows(20)] },
  });
  console.log(`已寫入 header 與 20 筆範例資料（分頁：${tabName}）`);

  if (created && shareEmail) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: "writer", type: "user", emailAddress: shareEmail },
      sendNotificationEmail: true,
    });
    console.log(`已將 Sheet 分享給 ${shareEmail}（編輯者）`);
  }

  upsertEnv(".env.local", {
    GOOGLE_SA_KEY_FILE: keyFile,
    SHEET_SPREADSHEET_ID: spreadsheetId,
    SHEET_TAB_NAME: tabName,
  });

  console.log(`\n✓ 完成`);
  console.log(`  Sheet：https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  console.log(`  .env.local 已更新`);
  console.log(`\n下一步：npm run sheets:verify，然後 npm run dev`);
  if (!created) {
    console.log(`\n提醒：請確認這張 Sheet 已把 ${saEmail} 加為「編輯者」。`);
  }
} catch (error) {
  if (error?.response?.status === 403 || error?.code === 403) {
    fail(
      `沒有權限存取這張 Sheet。\n請把 Sheet 分享給 ${saEmail}（編輯者），並確認已啟用 Google Sheets API 與 Google Drive API。`,
    );
  }
  fail(error?.message ?? String(error));
}
