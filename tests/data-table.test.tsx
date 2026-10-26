// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/data-table";
import type { RowView } from "@/lib/schema";

function makeRow(id: string, name: string, updatedAt: string): RowView {
  return {
    project_name: name,
    client: "Acme",
    status: "active",
    owner: "Ariel",
    amount: 1000,
    notes: "",
    _row_id: id,
    _version: 1,
    _updated_at: updatedAt,
    _updated_by: "demo@example.com",
    _op_id: "op",
    _deleted: false,
    content_hash: "sha256:x",
    stale: false,
  };
}

const rows = [
  makeRow("id-a", "專案 A", "2026-01-02T00:00:00.000Z"),
  makeRow("id-b", "專案 B", "2026-01-01T00:00:00.000Z"),
];

afterEach(cleanup);

describe("DataTable", () => {
  it("點列以 _row_id 回報選取", () => {
    const onSelect = vi.fn();
    render(<DataTable rows={rows} selectedRowId={null} onSelect={onSelect} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText("專案 A"));
    expect(onSelect).toHaveBeenCalledWith("id-a");
  });

  it("排序後點列仍以 _row_id 回報，不會因索引位移選錯", () => {
    const onSelect = vi.fn();
    render(<DataTable rows={rows} selectedRowId={null} onSelect={onSelect} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText("專案名稱"));
    fireEvent.click(screen.getByText("專案 B"));
    expect(onSelect).toHaveBeenLastCalledWith("id-b");
  });

  it("列上的編輯按鈕回報該列 _row_id", () => {
    const onEdit = vi.fn();
    render(<DataTable rows={rows} selectedRowId={null} onSelect={vi.fn()} onEdit={onEdit} />);
    fireEvent.click(screen.getAllByRole("button", { name: "編輯" })[0]);
    expect(onEdit).toHaveBeenCalledWith("id-a");
  });
});
