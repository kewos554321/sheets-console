import { getRepository } from "@/lib/repository-factory";
import { sheetErrorResponse } from "@/lib/sheet-error-response";
import { SheetError } from "@/lib/sheets/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rowId = new URL(request.url).searchParams.get("rowId");
  if (!rowId) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "缺少 rowId" } }, { status: 400 });
  }

  const repo = getRepository();
  try {
    return Response.json({ events: await repo.audit(rowId) });
  } catch (error) {
    if (error instanceof SheetError) return sheetErrorResponse(error);
    throw error;
  }
}
