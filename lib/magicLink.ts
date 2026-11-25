import crypto from 'crypto';

export interface MagicLeadPayload {
  email: string;
  vehicleHint: string;
  notes?: string;
  createdAt: string;
}

const DEFAULT_SECRET = 'dev-secret-change-in-production-scanner-auto';

function getSecret(): string {
  return process.env.MAGIC_LINK_SECRET || DEFAULT_SECRET;
}

export function createMagicToken(payload: MagicLeadPayload): string {
  const json = JSON.stringify(payload);
  const dataB64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(dataB64)
    .digest('base64url');

  return `${dataB64}.${sig}`;
}

export function verifyMagicToken(token: string): MagicLeadPayload | null {
  if (!token || !token.includes('.')) return null;

  const [dataB64, sig] = token.split('.');
  if (!dataB64 || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(dataB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const raw = Buffer.from(dataB64, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as MagicLeadPayload;
    if (!parsed.email || !parsed.vehicleHint) return null;
    return parsed;
  } catch {
    return null;
  }
}