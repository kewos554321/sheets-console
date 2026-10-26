export function formatAmount(amount: number): string {
  return `NT$${amount.toLocaleString("en-US")}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(iso));
}
