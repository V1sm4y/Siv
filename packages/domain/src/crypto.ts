import { createHash, randomBytes } from 'node:crypto';

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');
/** URL-safe random token with 256 bits of entropy. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** JSON with recursively sorted keys so hashes do not depend on property order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}
