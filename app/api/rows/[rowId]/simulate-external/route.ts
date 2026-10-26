import { getRepository } from "@/lib/repository-factory";
import { RowNotFoundError } from "@/lib/repository";
import { sheetErrorResponse } from "@/lib/sheet-error-response";
import { SheetError } from "@/lib/sheets/types";

export async function POST(_request: Request, { params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await params;
  const repo = getRepository();
  try {
    return Response.json(await repo.simulateExternal(rowId));
  } catch (error) {
    if (error instanceof RowNotFoundError) {
      return Response.json({ error: { code: "ROW_NOT_FOUND", message: "找不到此列" } }, { status: 404 });
    }
    if (error instanceof SheetError) {
      return sheetErrorResponse(error);
    }
    throw error;
  }
}
