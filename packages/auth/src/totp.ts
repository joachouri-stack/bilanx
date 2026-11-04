/**
 * TOTP (RFC 6238) avec HMAC-SHA1, 6 chiffres, pas de 30 s — compatible avec
 * les applications d'authentification courantes.
 */
import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Caractère base32 invalide.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(20); // 160 bits, taille recommandée pour SHA-1
}

export const TOTP_STEP_SECONDS = 30;

export function timeStep(at: Date): number {
  return Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | ((mac[offset + 1]! & 0xff) << 16) | ((mac[offset + 2]! & 0xff) << 8) | (mac[offset + 3]! & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totp(secret: Buffer, at: Date, digits = 6): string {
  return hotp(secret, timeStep(at), digits);
}

/**
 * Vérifie un code dans une fenêtre de ±1 pas (dérive d'horloge) et renvoie le
 * pas accepté, à mémoriser pour refuser toute réutilisation (anti-rejeu).
 */
export function verifyTotp(secret: Buffer, code: string, at: Date, lastUsedStep: number | null, window = 1): number | null {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = timeStep(at);
  for (let d = -window; d <= window; d++) {
    const step = now + d;
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (hotp(secret, step) === c) return step;
  }
  return null;
}

export function otpauthUri(secret: Buffer, accountLabel: string, issuer = 'BILANX'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({ secret: base32Encode(secret), issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
