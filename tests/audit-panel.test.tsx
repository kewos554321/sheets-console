// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuditPanel } from "@/components/audit-panel";
import type { AuditEvent } from "@/lib/schema";

const event: AuditEvent = {
  id: "event-1",
  rowId: "row-a",
  actorLabel: "demo@example.com",
  source: "ui",
  action: "create",
  before: null,
  after: null,
  diff: [],
  opId: "op-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(cleanup);

describe("AuditPanel", () => {
  it("載入中不顯示上一列的事件", () => {
    render(<AuditPanel events={[event]} loading={true} rowLabel="專案 B" />);
    expect(screen.queryByText("建立")).toBeNull();
  });

  it("載入完成後顯示事件", () => {
    render(<AuditPanel events={[event]} loading={false} rowLabel="專案 B" />);
    expect(screen.getByText("建立")).toBeTruthy();
  });
});
