import type { AuditEvent, SheetRow } from "./schema";
import { generateSeedRows } from "./seed";

export type Store = {
  rows: Map<string, SheetRow>;
  audits: AuditEvent[];
};

declare global {
  // eslint-disable-next-line no-var
  var __sheetsConsoleStore: Store | undefined;
}

function createStore(): Store {
  const rows = generateSeedRows(1000);
  return {
    rows: new Map(rows.map((row) => [row._row_id, row])),
    audits: [],
  };
}

export function getStore(): Store {
  if (!globalThis.__sheetsConsoleStore) {
    globalThis.__sheetsConsoleStore = createStore();
  }
  return globalThis.__sheetsConsoleStore;
}

export function resetStore(): void {
  globalThis.__sheetsConsoleStore = createStore();
}
