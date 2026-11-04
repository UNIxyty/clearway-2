export function callerAddress(headers: { get(name: string): string | null }): string | null;
export function hourlyLimit(max: number): { take(key: string): boolean };
export const NO_ADDRESS: string;
