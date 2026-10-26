import {
  BUSINESS_FIELDS,
  STATUSES,
  type ProjectFields,
  type ProjectStatus,
  type SheetRow,
} from "../schema";
import { SheetError, type CellUpdate, type CellValue, type SheetMatrix } from "./types";

export const META_HEADERS = [
  "_row_id",
  "_version",
  "_updated_at",
  "_updated_by",
  "_op_id",
  "_deleted",
] as const;

export const SHEET_HEADERS = [...META_HEADERS, ...BUSINESS_FIELDS] as const;

export class SheetMappingError extends SheetError {
  constructor(
    message: string,
    readonly missing: string[] = [],
  ) {
    super("SCHEMA_DRIFT", message);
    this.name = "SheetMappingError";
  }
}

export function parseHeaders(matrix: SheetMatrix): {
  headers: string[];
  indexByHeader: Record<string, number>;
} {
  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map((value) => String(value ?? "").trim());
  const indexByHeader: Record<string, number> = {};

  headers.forEach((header, index) => {
    if (header) indexByHeader[header] = index;
  });

  const missing = SHEET_HEADERS.filter((header) => !(header in indexByHeader));
  if (missing.length > 0) {
    throw new SheetMappingError(`缺少必要欄位：${missing.join(", ")}`, missing);
  }

  return { headers, indexByHeader };
}

function cellReader(raw: CellValue[], indexByHeader: Record<string, number>) {
  return (header: string): CellValue | undefined => raw[indexByHeader[header]];
}

export function matrixToRows(matrix: SheetMatrix): SheetRow[] {
  const { indexByHeader } = parseHeaders(matrix);
  const rows: SheetRow[] = [];
  const seen = new Set<string>();

  for (let index = 1; index < matrix.length; index += 1) {
    const raw = matrix[index] ?? [];
    if (raw.every((value) => String(value ?? "").trim() === "")) continue;

    const cell = cellReader(raw, indexByHeader);
    const rowNumber = index + 1;
    const rowId = String(cell("_row_id") ?? "").trim();

    if (!rowId) throw new SheetMappingError(`第 ${rowNumber} 列缺少 _row_id`);
    if (seen.has(rowId)) throw new SheetMappingError(`第 ${rowNumber} 列 _row_id 重複：${rowId}`);
    seen.add(rowId);

    const version = Number(cell("_version"));
    if (!Number.isInteger(version) || version < 1) {
      throw new SheetMappingError(`第 ${rowNumber} 列 _version 不是正整數`);
    }

    const amountRaw = cell("amount");
    const amount = typeof amountRaw === "number" ? amountRaw : Number(String(amountRaw ?? ""));
    if (!Number.isFinite(amount)) {
      throw new SheetMappingError(`第 ${rowNumber} 列金額不是有效數字`);
    }

    const status = String(cell("status") ?? "");
    if (!STATUSES.includes(status as ProjectStatus)) {
      throw new SheetMappingError(`第 ${rowNumber} 列狀態無效：${status}`);
    }

    const deletedRaw = cell("_deleted");
    const deleted = deletedRaw === true || String(deletedRaw).toUpperCase() === "TRUE";

    rows.push({
      _row_id: rowId,
      _version: version,
      _updated_at: String(cell("_updated_at") ?? ""),
      _updated_by: String(cell("_updated_by") ?? ""),
      _op_id: String(cell("_op_id") ?? ""),
      _deleted: deleted,
      project_name: String(cell("project_name") ?? ""),
      client: String(cell("client") ?? ""),
      status: status as ProjectStatus,
      owner: String(cell("owner") ?? ""),
      amount,
      notes: String(cell("notes") ?? ""),
    });
  }

  return rows;
}

function valueForHeader(row: ProjectFields, header: string): CellValue {
  const value = (row as unknown as Record<string, unknown>)[header];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return "";
}

export function rowToArray(row: SheetRow): CellValue[] {
  return SHEET_HEADERS.map((header) => valueForHeader(row, header));
}

export function rowToArrayInHeaderOrder(row: SheetRow, headers: string[]): CellValue[] {
  return headers.map((header) => valueForHeader(row, header));
}

export function rowsToMatrix(rows: SheetRow[]): SheetMatrix {
  return [[...SHEET_HEADERS], ...rows.map((row) => rowToArray(row))];
}

export function diffToCellUpdates(
  rowNumber: number,
  headers: string[],
  before: ProjectFields,
  after: ProjectFields,
): CellUpdate[] {
  return BUSINESS_FIELDS.filter((field) => before[field] !== after[field]).flatMap((field) => {
    const columnIndex = headers.indexOf(field);
    return columnIndex === -1 ? [] : [{ rowNumber, columnIndex, value: after[field] }];
  });
}

export function metaCellUpdates(rowNumber: number, headers: string[], row: SheetRow): CellUpdate[] {
  const meta: Array<[string, CellValue]> = [
    ["_version", row._version],
    ["_updated_at", row._updated_at],
    ["_updated_by", row._updated_by],
    ["_op_id", row._op_id],
    ["_deleted", row._deleted],
  ];

  return meta.flatMap(([header, value]) => {
    const columnIndex = headers.indexOf(header);
    return columnIndex === -1 ? [] : [{ rowNumber, columnIndex, value }];
  });
}

export function columnLetter(index: number): string {
  let letters = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return letters;
}
