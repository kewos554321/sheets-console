import { getRepository } from "@/lib/repository-factory";
import { sheetErrorResponse } from "@/lib/sheet-error-response";
import { createRowSchema } from "@/lib/schema";
import { SheetError } from "@/lib/sheets/types";

export const dynamic = "force-dynamic";

const ACTOR = "demo@example.com";

export async function GET() {
  const repo = getRepository();
  const [rows, lastSyncedAt] = await Promise.all([repo.list(), repo.lastSyncedAt()]);
  return Response.json({ rows, lastSyncedAt });
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = createRowSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "欄位驗證失敗", fields: parsed.error.flatten().fieldErrors } },
      { status: 400 },
    );
  }

  const repo = getRepository();
  try {
    return Response.json(await repo.create(parsed.data, ACTOR, crypto.randomUUID()), { status: 201 });
  } catch (error) {
    if (error instanceof SheetError) return sheetErrorResponse(error);
    throw error;
  }
}
