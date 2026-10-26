import { Console } from "@/components/console";
import { getRepository, getRepositoryMode } from "@/lib/repository-factory";

export const dynamic = "force-dynamic";

export default async function Page() {
  const repo = getRepository();
  const [rows, lastSyncedAt] = await Promise.all([repo.list(), repo.lastSyncedAt()]);
  return (
    <Console
      initialRows={rows}
      initialLastSyncedAt={lastSyncedAt}
      dataSource={getRepositoryMode()}
    />
  );
}
