/** Salary amounts are shown in whole rupees with Indian digit grouping. */
export const rupees = (value: unknown): string =>
  Math.round(Number(value ?? 0) || 0).toLocaleString('en-IN')
