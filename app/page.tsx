import { Console } from "@/components/console";
import { FakeSheetRepository } from "@/lib/fake-repository";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Page() {
  const repo = new FakeSheetRepository(getStore());
  return <Console initialRows={repo.list()} initialLastSyncedAt={repo.lastSyncedAt()} />;
}
