import { describe, expect, it } from "vitest";
import { toConflictPayload } from "@/lib/conflict";
import { VersionConflictError } from "@/lib/repository";
import type { ProjectFields, RowView } from "@/lib/schema";

const mine: ProjectFields = {
  project_name: "我的版本",
  client: "Acme",
  status: "done",
  owner: "Ariel",
  amount: 1,
  notes: "",
};

const current: RowView = {
  ...mine,
  project_name: "Sheet 版本",
  _row_id: "row-1",
  _version: 3,
  _updated_at: "2026-01-01T00:00:00.000Z",
  _updated_by: "unknown (Sheet)",
  _op_id: "op",
  _deleted: false,
  content_hash: "sha256:abc",
  stale: true,
};

describe("toConflictPayload", () => {
  it("帶出 base 版本、hash、我的輸入與目前列", () => {
    const payload = toConflictPayload(new VersionConflictError(2, "sha256:old", mine, current));
    expect(payload.error.code).toBe("VERSION_CONFLICT");
    expect(payload.conflict.baseVersion).toBe(2);
    expect(payload.conflict.baseHash).toBe("sha256:old");
    expect(payload.conflict.mine).toEqual(mine);
    expect(payload.conflict.current).toEqual(current);
  });
});
