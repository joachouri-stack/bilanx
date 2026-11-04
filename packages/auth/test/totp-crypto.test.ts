import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, totp, verifyTotp, otpauthUri } from '../src/totp';
import { decrypt, encrypt, parseSecretKey } from '../src/crypto';
import { hashPassword, passwordProblems, verifyPassword } from '../src/password';

// Vecteurs officiels RFC 4226 (annexe D) et RFC 6238 (annexe B, SHA-1, 8 chiffres).
const RFC_SECRET = Buffer.from('12345678901234567890');

describe('HOTP / TOTP', () => {
  it('respecte les vecteurs RFC 4226', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, i) => expect(hotp(RFC_SECRET, i)).toBe(code));
  });
  it('respecte les vecteurs RFC 6238', () => {
    expect(totp(RFC_SECRET, new Date(59_000), 8)).toBe('94287082');
    expect(totp(RFC_SECRET, new Date(1_111_111_109_000), 8)).toBe('07081804');
    expect(totp(RFC_SECRET, new Date(1_234_567_890_000), 8)).toBe('89005924');
    expect(totp(RFC_SECRET, new Date(20_000_000_000_000), 8)).toBe('65353130');
  });
  it('accepte ±1 pas et refuse la réutilisation', () => {
    const at = new Date('2026-11-04T10:00:00Z');
    const code = totp(RFC_SECRET, new Date(at.getTime() - 30_000));
    const step = verifyTotp(RFC_SECRET, code, at, null);
    expect(step).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, at, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, new Date(at.getTime() - 120_000)), at, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', at, null)).toBeNull();
  });
  it('encode le base32 de façon réversible', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(otpauthUri(RFC_SECRET, 'a@b.fr')).toContain('otpauth://totp/BILANX%3Aa%40b.fr?secret=');
  });
});

describe('chiffrement AES-256-GCM', () => {
  const key = Buffer.alloc(32, 1);
  it('chiffre et déchiffre', () => {
    const blob = encrypt(key, Buffer.from('secret'), 'compte-1');
    expect(decrypt(key, blob, 'compte-1').toString()).toBe('secret');
  });
  it('refuse un contexte différent ou une donnée altérée', () => {
    const blob = encrypt(key, Buffer.from('secret'), 'compte-1');
    expect(() => decrypt(key, blob, 'compte-2')).toThrow();
    blob[blob.length - 1]! ^= 1;
    expect(() => decrypt(key, blob, 'compte-1')).toThrow();
  });
  it('valide la clé maîtresse', () => {
    expect(() => parseSecretKey(undefined)).toThrow();
    expect(() => parseSecretKey(Buffer.alloc(16).toString('base64'))).toThrow();
    expect(parseSecretKey(Buffer.alloc(32).toString('base64'))).toHaveLength(32);
  });
});

describe('mots de passe', () => {
  it('hache en argon2id et vérifie', async () => {
    const h = await hashPassword('une phrase de passe longue');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'une phrase de passe longue')).toBe(true);
    expect(await verifyPassword(h, 'mauvais')).toBe(false);
  });
  it('applique les règles de longueur et refuse les mots de passe triviaux', () => {
    expect(passwordProblems('court')).toHaveLength(1);
    expect(passwordProblems('azertyuiop12')).toContain('Ce mot de passe est trop courant.');
    expect(passwordProblems('jean.dupont-2026!', 'jean.dupont@exemple.fr').join()).toContain('adresse e-mail');
    expect(passwordProblems('cheval-agrafe-batterie')).toEqual([]);
  });
});
