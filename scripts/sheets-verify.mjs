import { existsSync } from "node:fs";
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

const keyFile = process.env.GOOGLE_SA_KEY_FILE?.trim() || "./secrets/sa.json";
const spreadsheetId = process.env.SHEET_SPREADSHEET_ID?.trim() || "";
const tabName = process.env.SHEET_TAB_NAME?.trim() || "Projects";

if (!existsSync(keyFile)) {
  console.error(`✗ 找不到 Service Account 金鑰：${keyFile}`);
  process.exit(1);
}
if (!spreadsheetId) {
  console.error("✗ 缺少 SHEET_SPREADSHEET_ID，請先執行 npm run sheets:setup");
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

try {
  const credentials = await auth.getCredentials();
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const range = `'${tabName.replace(/'/g, "''")}'!A1:AZ`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const matrix = response.data.values ?? [];
  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
  const missing = HEADERS.filter((header) => !headers.includes(header));
  const dataRows = matrix.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));

  console.log(`模式        ：google`);
  console.log(`Service Acc ：${credentials.client_email ?? "(unknown)"}`);
  console.log(`Sheet       ：${url}`);
  console.log(`分頁        ：${tabName}`);
  console.log(`資料列      ：${dataRows.length}`);
  console.log(`Header      ：${headers.join(" | ")}`);

  if (missing.length > 0) {
    console.error(`\n✗ 缺少必要欄位：${missing.join(", ")}`);
    console.error(`請執行 npm run sheets:setup 初始化，或補上缺少的欄位。`);
    process.exit(1);
  }

  console.log(`\n✓ 連線與 schema 檢查通過`);
} catch (error) {
  const status = error?.response?.status ?? error?.code;
  if (status === 403 || status === 401) {
    console.error("✗ 沒有權限。請把 Sheet 分享給 Service Account（編輯者），並確認 API 已啟用。");
  } else if (status === 404) {
    console.error("✗ 找不到 spreadsheet 或分頁，請確認 SHEET_SPREADSHEET_ID 與 SHEET_TAB_NAME。");
  } else {
    console.error(`✗ 驗證失敗：${error?.message ?? error}`);
  }
  process.exit(1);
}
