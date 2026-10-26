import type { CellUpdate, CellValue, SheetMatrix } from "./types";

export interface SheetsGateway {
  readAll(): Promise<SheetMatrix>;
  appendRow(values: CellValue[]): Promise<void>;
  updateCells(updates: CellUpdate[]): Promise<void>;
  url(): string;
}
