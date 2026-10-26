import { existsSync } from "node:fs";
import { ConfigError, getGoogleConfig } from "./config";
import { FakeSheetRepository } from "./fake-repository";
import type { SheetRepository } from "./repository";
import { GoogleSheetsGateway } from "./sheets/google-gateway";
import { GoogleSheetRepository } from "./sheets/google-repository";
import { getStore } from "./store";

export type RepositoryMode = "google" | "fake";

let cached: { repo: SheetRepository; mode: RepositoryMode } | null = null;

function create(): { repo: SheetRepository; mode: RepositoryMode } {
  const config = getGoogleConfig();

  if (!config) {
    return { repo: new FakeSheetRepository(getStore()), mode: "fake" };
  }

  if (!existsSync(config.keyFile)) {
    throw new ConfigError(`找不到 Service Account 金鑰檔：${config.keyFile}`);
  }

  return {
    repo: new GoogleSheetRepository(new GoogleSheetsGateway(config)),
    mode: "google",
  };
}

export function getRepository(): SheetRepository {
  cached ??= create();
  return cached.repo;
}

export function getRepositoryMode(): RepositoryMode {
  cached ??= create();
  return cached.mode;
}

export function resetRepositoryForTests(): void {
  cached = null;
}
