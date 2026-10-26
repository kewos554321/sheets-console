export type CellValue = string | number | boolean;
export type SheetMatrix = CellValue[][];

export type CellUpdate = {
  rowNumber: number;
  columnIndex: number;
  value: CellValue;
};

export type SheetErrorCode =
  | "SCHEMA_DRIFT"
  | "SHEET_UNAUTHORIZED"
  | "SHEET_NOT_FOUND"
  | "SHEET_RATE_LIMIT"
  | "SHEET_ERROR";

export class SheetError extends Error {
  constructor(
    readonly code: SheetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SheetError";
  }
}
