export type AmountParseResult = { value: number } | { error: string };

export function parseAmountInput(raw: string): AmountParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "金額必須是數字" };

  const value = Number(trimmed);
  if (Number.isNaN(value)) return { error: "金額必須是數字" };

  return { value };
}
