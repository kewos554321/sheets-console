import type { ProjectStatus, SheetRow } from "./schema";

const CLIENTS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Wonka", "Hooli"];
const OWNERS = ["Ariel", "Bo", "Chen", "Dana", "Eli", "Fang", "Gus", "Hana"];
const STATUSES: ProjectStatus[] = ["planning", "active", "blocked", "done"];

export function seedRowId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function generateSeedRows(count = 1000): SheetRow[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      project_name: `專案 ${String(n).padStart(3, "0")}`,
      client: CLIENTS[i % CLIENTS.length],
      status: STATUSES[i % STATUSES.length],
      owner: OWNERS[i % OWNERS.length],
      amount: 10000 + i * 500,
      notes: i % 3 === 0 ? `第 ${n} 筆示範資料` : "",
      _row_id: seedRowId(n),
      _version: 1,
      _updated_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
      _updated_by: "demo@example.com",
      _op_id: "seed",
      _deleted: false,
    };
  });
}
