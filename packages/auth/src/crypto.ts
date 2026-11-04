import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Jeton aléatoire URL-safe (256 bits par défaut). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function hmacSha256(key: Buffer, input: string): Buffer {
  return createHmac('sha256', key).update(input).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Clé de chiffrement applicative (32 octets, base64). En production elle
 * provient d'un KMS/HSM de l'hébergeur ; jamais commitée.
 */
export function parseSecretKey(b64: string | undefined): Buffer {
  if (!b64) throw new Error('BILANX_SECRET_KEY manquant : générez-le avec `openssl rand -base64 32`.');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('BILANX_SECRET_KEY doit faire exactement 32 octets (base64).');
  return key;
}

/** Sous-clés dérivées par usage, pour ne jamais réutiliser la même clé à deux fins. */
export function deriveKey(master: Buffer, purpose: string): Buffer {
  return hmacSha256(master, `bilanx:${purpose}`);
}

/** AES-256-GCM : [version 1][iv 12][tag 16][chiffré]. */
export function encrypt(key: Buffer, plaintext: Buffer, aad = ''): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), enc]);
}

export function decrypt(key: Buffer, blob: Buffer, aad = ''): Buffer {
  if (blob[0] !== 1) throw new Error('Format de chiffrement inconnu.');
  const iv = blob.subarray(1, 13);
  const tag = blob.subarray(13, 29);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(29)), d.final()]);
}
