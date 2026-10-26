import { FakeSheetRepository } from "@/lib/fake-repository";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rowId = new URL(request.url).searchParams.get("rowId");
  if (!rowId) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "缺少 rowId" } }, { status: 400 });
  }

  const repo = new FakeSheetRepository(getStore());
  return Response.json({ events: repo.audit(rowId) });
}
