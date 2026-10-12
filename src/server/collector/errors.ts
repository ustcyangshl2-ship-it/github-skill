export class CollectorError extends Error {
  constructor(public code: string, public retryable = false, public retryAt?: Date, public httpStatus?: number, public rateScope?: "PRIMARY" | "SECONDARY") { super(code); this.name = "CollectorError"; }
}
export function asCollectorError(error: unknown) { return error instanceof CollectorError ? error : new CollectorError("COLLECTOR_INTERNAL_ERROR", true); }
export function retryTime(attempt: number, now: Date, minimum?: Date, random = Math.random) {
  const delay = Math.min(300000, 1000 * 2 ** Math.min(attempt, 8)) + Math.floor(random() * 1000);
  return new Date(Math.max(now.getTime() + delay, minimum?.getTime() ?? 0));
}
