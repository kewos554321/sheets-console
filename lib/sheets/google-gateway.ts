import { google } from "googleapis";
import type { SheetsGateway } from "./gateway";
import { columnLetter } from "./mapping";
import { SheetError, type CellUpdate, type CellValue, type SheetMatrix } from "./types";

export type GoogleGatewayConfig = {
  keyFile: string;
  spreadsheetId: string;
  tabName: string;
};

function statusOf(error: unknown): number | null {
  const candidate = error as {
    code?: number | string;
    response?: { status?: number };
  };
  const raw = candidate.response?.status ?? candidate.code;
  const status = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(status) ? status : null;
}

export function toSheetError(error: unknown): SheetError {
  if (error instanceof SheetError) return error;

  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return new SheetError(
      "SHEET_UNAUTHORIZED",
      "Google Sheets 拒絕存取。請確認已把 Sheet 分享給 Service Account（編輯者），且 API 已啟用。",
    );
  }
  if (status === 404) {
    return new SheetError("SHEET_NOT_FOUND", "找不到 spreadsheet 或分頁，請確認 ID 與 SHEET_TAB_NAME。");
  }
  if (status === 429) {
    return new SheetError("SHEET_RATE_LIMIT", "Google Sheets API 暫時限流，請稍後再試。");
  }
  return new SheetError("SHEET_ERROR", "Google Sheets API 呼叫失敗，請稍後再試。");
}

export class GoogleSheetsGateway implements SheetsGateway {
  private readonly sheets;

  constructor(private readonly config: GoogleGatewayConfig) {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.keyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  private range(a1: string): string {
    const tab = this.config.tabName.replace(/'/g, "''");
    return `'${tab}'!${a1}`;
  }

  async readAll(): Promise<SheetMatrix> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.config.spreadsheetId,
        range: this.range("A1:AZ"),
        majorDimension: "ROWS",
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      return (response.data.values ?? []) as SheetMatrix;
    } catch (error) {
      throw toSheetError(error);
    }
  }

  async appendRow(values: CellValue[]): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.config.spreadsheetId,
        range: this.range("A1"),
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [values] },
      });
    } catch (error) {
      throw toSheetError(error);
    }
  }

  async updateCells(updates: CellUpdate[]): Promise<void> {
    if (updates.length === 0) return;

    try {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.config.spreadsheetId,
        requestBody: {
          valueInputOption: "RAW",
          data: updates.map((update) => ({
            range: this.range(`${columnLetter(update.columnIndex)}${update.rowNumber}`),
            values: [[update.value]],
          })),
        },
      });
    } catch (error) {
      throw toSheetError(error);
    }
  }

  url(): string {
    return `https://docs.google.com/spreadsheets/d/${this.config.spreadsheetId}/edit`;
  }
}
