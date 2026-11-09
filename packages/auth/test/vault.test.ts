import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVaultService } from '../src';
import { setupAuth, TEST_DB, tokenFrom } from './helpers';

describe.skipIf(!TEST_DB)('coffre d’identifiants (PostgreSQL réel)', () => {
  let ctx: Awaited<ReturnType<typeof setupAuth>>;
  let vault: ReturnType<typeof createVaultService>;
  let jo = '', marc = '';
  async function user(email: string) {
    await ctx.auth.signUp({ email, password: 'cheval-agrafe-batterie', displayName: 'X', acceptHealthProcessing: true, acceptAiExtraction: false });
    await ctx.auth.verifyEmail(tokenFrom(ctx.mailer.last(email)?.text));
    return (await ctx.sql<{ id: string }[]>`SELECT id FROM account WHERE email = ${email}`)[0]!.id;
  }
  beforeAll(async () => {
    ctx = await setupAuth();
    vault = createVaultService({ sql: ctx.sql, secretKey: Buffer.alloc(32, 5), now: () => new Date(ctx.clock.t) });
    jo = await user('jo@exemple.fr');
    marc = await user('marc@exemple.fr');
  });
  afterAll(async () => {
    await ctx?.sql.end();
  });

  it('ajout : mot de passe chiffré, liste sans mot de passe, affichage journalisé', async () => {
    const r = await vault.add(jo, { service: ' Doctolib ', url: 'doctolib.fr', login: 'jo@exemple.fr', password: 'S3cr3t!é' });
    expect(r.ok).toBe(true);
    const id = r.ok ? r.id : '';
    const [raw] = await ctx.sql<{ secret_enc: Buffer }[]>`SELECT secret_enc FROM vault_entry WHERE id = ${id}`;
    expect(raw!.secret_enc.toString('utf8')).not.toContain('S3cr3t');
    const list = await vault.list(jo);
    expect(list).toEqual([expect.objectContaining({ service: 'Doctolib', url: 'https://doctolib.fr/', login: 'jo@exemple.fr' })]);
    expect(JSON.stringify(list)).not.toContain('S3cr3t');
    expect(await vault.reveal(jo, id)).toBe('S3cr3t!é');
    const [a] = await ctx.sql<{ n: number }[]>`SELECT count(*)::int AS n FROM audit_log WHERE action = 'vault.reveal' AND resource_id = ${id}`;
    expect(a!.n).toBe(1);
  });

  it('un autre compte ne voit ni ne déchiffre rien ; modification ; suppression', async () => {
    const id = (await vault.list(jo))[0]!.id;
    expect(await vault.list(marc)).toEqual([]);
    expect(await vault.reveal(marc, id)).toBeNull();
    expect(await vault.remove(marc, id)).toBe(false);
    expect(await vault.updatePassword(jo, id, 'nouveau')).toBe(true);
    expect(await vault.reveal(jo, id)).toBe('nouveau');
    expect(await vault.remove(jo, id)).toBe(true);
    expect(await vault.list(jo)).toEqual([]);
  });

  it('refus : nom ou mot de passe manquant', async () => {
    expect((await vault.add(jo, { service: '', password: 'x' })).ok).toBe(false);
    expect((await vault.add(jo, { service: 'Ameli', password: '' })).ok).toBe(false);
  });
});
