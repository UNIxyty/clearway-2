export function callerAddress(headers: { get(name: string): string | null }): string | null;
export function hourlyLimit(max: number): { take(key: string): boolean };
export const NO_ADDRESS: string;
export const NO_ADDRESS_ALARM_AT: number;
export function noAddressRefused(route: string, opts?: { now?: number; send?: (text: string) => Promise<boolean> | boolean }): { count: number; alarm: Promise<boolean> | null };
export function resetNoAddressAlarm(): void;
