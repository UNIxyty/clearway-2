// "The original email was read on this device, this session" — the prerequisite for confirming a request to Leon
// (decided 2026-10-20: anyone who confirms a flight must have read what the client asked for; refuse rather than
// confirm blind). Shared by the desk's drawer and confirm bar and the phone's email page and confirm step. Session
// storage, per request, never the account: a read on another device does not count here.
export const emailReadKey = (requestId: string) => `intake-email-read:${requestId}`;
export const markEmailRead = (requestId: string) => { try { sessionStorage.setItem(emailReadKey(requestId), new Date().toISOString()); } catch { /* private mode: the gate just asks again */ } };
export const emailReadAt = (requestId: string): string | null => { try { return sessionStorage.getItem(emailReadKey(requestId)); } catch { return null; } };
