import { toConflictPayload } from "@/lib/conflict";
import { getRepository } from "@/lib/repository-factory";
import { RowNotFoundError, VersionConflictError } from "@/lib/repository";
import { sheetErrorResponse } from "@/lib/sheet-error-response";
import { updateRowSchema } from "@/lib/schema";
import { SheetError } from "@/lib/sheets/types";

const ACTOR = "demo@example.com";

export async function PATCH(request: Request, { params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await params;
  const json = await request.json().catch(() => null);
  const parsed = updateRowSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "欄位驗證失敗", fields: parsed.error.flatten().fieldErrors } },
      { status: 400 },
    );
  }

  const repo = getRepository();
  try {
    return Response.json(await repo.update(rowId, parsed.data, ACTOR, crypto.randomUUID()));
  } catch (error) {
    if (error instanceof RowNotFoundError) {
      return Response.json({ error: { code: "ROW_NOT_FOUND", message: "找不到此列" } }, { status: 404 });
    }
    if (error instanceof VersionConflictError) {
      return Response.json(toConflictPayload(error), { status: 409 });
    }
    if (error instanceof SheetError) {
      return sheetErrorResponse(error);
    }
    throw error;
  }
}
