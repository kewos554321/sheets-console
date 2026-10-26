export type GoogleConfig = {
  keyFile: string;
  spreadsheetId: string;
  tabName: string;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_TAB_NAME = "Projects";

export type EnvLike = Record<string, string | undefined>;

export function getGoogleConfig(env: EnvLike = process.env): GoogleConfig | null {
  const keyFile = env.GOOGLE_SA_KEY_FILE?.trim() ?? "";
  const spreadsheetId = env.SHEET_SPREADSHEET_ID?.trim() ?? "";
  const tabName = env.SHEET_TAB_NAME?.trim() || DEFAULT_TAB_NAME;

  if (!keyFile && !spreadsheetId) return null;

  if (!keyFile || !spreadsheetId) {
    const missing = [
      !keyFile ? "GOOGLE_SA_KEY_FILE" : null,
      !spreadsheetId ? "SHEET_SPREADSHEET_ID" : null,
    ].filter(Boolean);
    throw new ConfigError(`Google Sheets 設定不完整，缺少：${missing.join(", ")}`);
  }

  return { keyFile, spreadsheetId, tabName };
}
