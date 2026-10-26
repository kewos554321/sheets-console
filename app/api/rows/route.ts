import { FakeSheetRepository } from "@/lib/fake-repository";
import { createRowSchema } from "@/lib/schema";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const ACTOR = "demo@example.com";

export async function GET() {
  const repo = new FakeSheetRepository(getStore());
  return Response.json({ rows: repo.list(), lastSyncedAt: repo.lastSyncedAt() });
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

  const repo = new FakeSheetRepository(getStore());
  return Response.json(repo.create(parsed.data, ACTOR, crypto.randomUUID()), { status: 201 });
}
