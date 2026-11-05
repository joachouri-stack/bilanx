/**
 * Authentificateur WebAuthn logiciel, pour les tests : clé P-256 réelle, données signées construites
 * comme le ferait un téléphone (format d'attestation « none »).
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

export class SoftwareAuthenticator {
  readonly credentialId = Buffer.from(Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 255));
  private readonly key: KeyObject;
  private readonly cose: Uint8Array;
  counter = 0;
  userHandle: string | null = null;

  constructor(private readonly rpID: string, private readonly origin: string) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.key = privateKey;
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    // Clé COSE EC2 : kty=2, alg=-7 (ES256), crv=1 (P-256), x, y.
    this.cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, 'base64url')],
        [-3, Buffer.from(jwk.y, 'base64url')],
      ]),
    );
  }

  private authData(flags: number, withCredential: boolean): Buffer {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const parts = [sha(this.rpID), Buffer.from([flags]), count];
    if (withCredential) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credentialId.length);
      parts.push(Buffer.alloc(16), len, this.credentialId, Buffer.from(this.cose));
    }
    return Buffer.concat(parts);
  }

  /** Réponse à navigator.credentials.create(). `uv` : vérification de l'utilisateur (Face ID…). */
  register(options: { challenge: string; user: { id: string } }, opts: { origin?: string; uv?: boolean } = {}) {
    this.userHandle = options.user.id;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: opts.origin ?? this.origin, crossOrigin: false }));
    const flags = 0x01 | (opts.uv === false ? 0 : 0x04) | 0x40; // UP, UV, AT
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', this.authData(flags, true)]]) as never);
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ['internal'] },
    };
  }

  /** Réponse à navigator.credentials.get(). */
  authenticate(options: { challenge: string }, opts: { origin?: string; uv?: boolean; counter?: number; userHandle?: string | null } = {}) {
    this.counter = opts.counter ?? this.counter + 1;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: opts.origin ?? this.origin, crossOrigin: false }));
    const authData = this.authData(0x01 | (opts.uv === false ? 0 : 0x04), false);
    const signature = sign('sha256', Buffer.concat([authData, sha(clientDataJSON)]), this.key); // DER
    const handle = opts.userHandle === undefined ? this.userHandle : opts.userHandle;
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature), ...(handle ? { userHandle: handle } : {}) },
    };
  }
}
