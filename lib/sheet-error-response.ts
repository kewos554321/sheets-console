import type { SheetError } from "./sheets/types";

export function sheetErrorResponse(error: SheetError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: 502 },
  );
}
