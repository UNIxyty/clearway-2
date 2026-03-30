export function normalizeEmail(email: string | null | undefined): string;
export function isValidEmail(email: string | null | undefined): boolean;
export function isValidPassword(password: string): boolean;
export function sha256Hex(value: string | number): string;
export function buildAppUrl(publicSiteUrl: string | null | undefined, requestOrigin: string | null | undefined): string;
export function randomToken(): string;
