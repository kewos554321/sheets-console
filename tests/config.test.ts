import { describe, expect, it } from "vitest";
import { ConfigError, getGoogleConfig } from "@/lib/config";

describe("getGoogleConfig", () => {
  it("完全沒設定時回傳 null（fake 模式）", () => {
    expect(getGoogleConfig({})).toBeNull();
    expect(getGoogleConfig({ SHEET_TAB_NAME: "Projects" })).toBeNull();
  });

  it("只設了部分必要變數時丟 ConfigError", () => {
    expect(() => getGoogleConfig({ GOOGLE_SA_KEY_FILE: "./secrets/sa.json" })).toThrowError(ConfigError);
    expect(() => getGoogleConfig({ SHEET_SPREADSHEET_ID: "sheet-1" })).toThrowError(ConfigError);
    expect(() => getGoogleConfig({ GOOGLE_SA_KEY_FILE: "   ", SHEET_SPREADSHEET_ID: "sheet-1" })).toThrowError(
      ConfigError,
    );
  });

  it("必要變數齊全時回傳設定，分頁預設 Projects", () => {
    expect(
      getGoogleConfig({ GOOGLE_SA_KEY_FILE: "./secrets/sa.json", SHEET_SPREADSHEET_ID: "sheet-1" }),
    ).toEqual({ keyFile: "./secrets/sa.json", spreadsheetId: "sheet-1", tabName: "Projects" });
  });

  it("使用指定的分頁名稱", () => {
    expect(
      getGoogleConfig({
        GOOGLE_SA_KEY_FILE: "./secrets/sa.json",
        SHEET_SPREADSHEET_ID: "sheet-1",
        SHEET_TAB_NAME: "工作表1",
      }),
    ).toEqual({ keyFile: "./secrets/sa.json", spreadsheetId: "sheet-1", tabName: "工作表1" });
  });
});
