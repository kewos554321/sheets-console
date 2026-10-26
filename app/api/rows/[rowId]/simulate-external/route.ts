import { FakeSheetRepository } from "@/lib/fake-repository";
import { RowNotFoundError } from "@/lib/repository";
import { getStore } from "@/lib/store";

export async function POST(_request: Request, { params }: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await params;
  const repo = new FakeSheetRepository(getStore());
  try {
    return Response.json(repo.simulateExternal(rowId));
  } catch (error) {
    if (error instanceof RowNotFoundError) {
      return Response.json({ error: { code: "ROW_NOT_FOUND", message: "找不到此列" } }, { status: 404 });
    }
    throw error;
  }
}
