import * as crypto from 'crypto';

const SECRET = process.env.UNSUBSCRIBE_SECRET ?? 'change-me-in-production';
const ALG = 'sha256';

export function generateToken(userId: string): string {
  const payload = Buffer.from(userId).toString('base64url');
  const sig = crypto.createHmac(ALG, SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac(ALG, SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return Buffer.from(payload, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
}

export function unsubscribeUrl(userId: string): string {
  const base = (process.env.APP_BASE_URL ?? 'https://clearway.verxyl.com').replace(/\/+$/, '');
  return `${base}/api/unsubscribe?token=${generateToken(userId)}`;
}
