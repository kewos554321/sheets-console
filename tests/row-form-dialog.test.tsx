// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RowFormDialog } from "@/components/row-form-dialog";
import type { ProjectFields } from "@/lib/schema";

const base: ProjectFields = {
  project_name: "官網改版",
  client: "Acme",
  status: "active",
  owner: "Ariel",
  amount: 120000,
  notes: "",
};

afterEach(cleanup);

function renderDialog() {
  const props = {
    title: "編輯專案",
    initial: base,
    initialVersion: 3,
    submitting: false,
    simulating: false,
    serverError: null,
    onSubmit: vi.fn(),
    onSimulate: vi.fn(),
    onClose: vi.fn(),
  };
  render(<RowFormDialog {...props} />);
  return props;
}

describe("RowFormDialog", () => {
  it("不關閉表單也能模擬外部修改", () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "模擬外部修改" }));
    expect(props.onSimulate).toHaveBeenCalledTimes(1);
  });

  it("金額含逗號時阻擋送出並顯示錯誤", () => {
    const props = renderDialog();
    fireEvent.change(screen.getByDisplayValue("120000"), { target: { value: "12,000" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("金額必須是數字")).toBeTruthy();
  });
});
