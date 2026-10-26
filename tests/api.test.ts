import { beforeEach, describe, expect, it } from "vitest";
import { POST as createRow } from "@/app/api/rows/route";
import { PATCH as updateRow } from "@/app/api/rows/[rowId]/route";
import { POST as simulateExternal } from "@/app/api/rows/[rowId]/simulate-external/route";
import { GET as getAudit } from "@/app/api/audit/route";
import { resetStore } from "@/lib/store";

const valid = {
  project_name: "官網改版",
  client: "Acme",
  status: "active",
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTestRow() {
  const res = await createRow(jsonRequest("http://localhost/api/rows", "POST", valid));
  return (await res.json()) as { row: { _row_id: string; _version: number; content_hash: string } };
}

beforeEach(() => resetStore());

describe("route handlers", () => {
  it("POST /api/rows 回 201 與稽核", async () => {
    const res = await createRow(jsonRequest("http://localhost/api/rows", "POST", valid));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.row._version).toBe(1);
    expect(body.audit.action).toBe("create");
  });

  it("POST /api/rows 驗證失敗回 400", async () => {
    const res = await createRow(jsonRequest("http://localhost/api/rows", "POST", { ...valid, amount: "12,000" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields.amount).toBeTruthy();
  });

  it("PATCH 版本過期回 409 並附 conflict", async () => {
    const created = await createTestRow();
    const res = await updateRow(
      jsonRequest(`http://localhost/api/rows/${created.row._row_id}`, "PATCH", {
        ...valid,
        status: "done",
        version: 1,
        baseHash: created.row.content_hash,
      }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(res.status).toBe(200);

    const conflict = await updateRow(
      jsonRequest(`http://localhost/api/rows/${created.row._row_id}`, "PATCH", {
        ...valid,
        status: "blocked",
        version: 1,
        baseHash: created.row.content_hash,
      }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(conflict.status).toBe(409);
    const body = await conflict.json();
    expect(body.conflict.baseVersion).toBe(1);
    expect(body.conflict.current._version).toBe(2);
  });

  it("外部修改後版本相同但 hash 過期也回 409", async () => {
    const created = await createTestRow();
    const external = await simulateExternal(
      new Request(`http://localhost/api/rows/${created.row._row_id}/simulate-external`, { method: "POST" }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(external.status).toBe(200);

    const res = await updateRow(
      jsonRequest(`http://localhost/api/rows/${created.row._row_id}`, "PATCH", {
        ...valid,
        amount: 1,
        version: created.row._version,
        baseHash: created.row.content_hash,
      }),
      { params: Promise.resolve({ rowId: created.row._row_id }) },
    );
    expect(res.status).toBe(409);
  });

  it("未知列回 404、缺 rowId 回 400", async () => {
    const missing = await updateRow(
      jsonRequest("http://localhost/api/rows/missing", "PATCH", { ...valid, version: 1, baseHash: "sha256:x" }),
      { params: Promise.resolve({ rowId: "missing" }) },
    );
    expect(missing.status).toBe(404);

    const noRowId = await getAudit(new Request("http://localhost/api/audit"));
    expect(noRowId.status).toBe(400);
  });

  it("GET /api/audit 回傳該列事件", async () => {
    const created = await createTestRow();
    const res = await getAudit(new Request(`http://localhost/api/audit?rowId=${created.row._row_id}`));
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].action).toBe("create");
  });
});
