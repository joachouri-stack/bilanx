import { describe, expect, it } from 'vitest';
import { contactInitials, contactName, formatPhone, mailtoHref, mapsLinks, telHref, validateContact } from '../src/contact';

describe('saisie d’un contact', () => {
  it('accepte un contact complet et nettoie les champs', () => {
    const r = validateContact({ firstName: ' Claire ', lastName: 'Martin', specialty: 'Ophtalmologue', phone: '01 23 45 67 89', email: 'C.Martin@Exemple.fr ', address: '12 rue de la Paix, 75002 Paris' });
    expect(r.ok && r.value).toEqual({
      firstName: 'Claire', lastName: 'Martin', specialty: 'Ophtalmologue', phone: '01 23 45 67 89', email: 'c.martin@exemple.fr', address: '12 rue de la Paix, 75002 Paris', notes: null,
    });
  });
  it('exige au moins le nom ou le prénom', () => {
    expect(validateContact({ phone: '0123456789' })).toMatchObject({ ok: false, errors: { lastName: expect.any(String) } });
    expect(validateContact({ lastName: 'Martin' }).ok).toBe(true);
    expect(validateContact({ firstName: 'Claire' }).ok).toBe(true);
  });
  it('refuse un e-mail ou un téléphone invalides', () => {
    expect(validateContact({ lastName: 'Martin', email: 'pas-un-mail' })).toMatchObject({ ok: false, errors: { email: expect.any(String) } });
    expect(validateContact({ lastName: 'Martin', phone: 'appeler le matin' })).toMatchObject({ ok: false, errors: { phone: expect.any(String) } });
    expect(validateContact({ lastName: 'Martin', phone: '+33 6 12 34 56 78' }).ok).toBe(true);
    expect(validateContact({ lastName: 'Martin', phone: '15' }).ok).toBe(false);
  });
});

describe('liens directs', () => {
  it('appeler : numéro sans espaces, + international conservé', () => {
    expect(telHref('01 23-45.67 89')).toBe('tel:0123456789');
    expect(telHref('+33 (0)6 12 34 56 78')).toBe('tel:+330612345678');
  });
  it('écrire : mailto avec l’adresse', () => {
    expect(mailtoHref('c.martin@exemple.fr')).toBe('mailto:c.martin@exemple.fr');
  });
  it('itinéraire : adresse encodée pour Google Maps, Plans et Waze', () => {
    const l = mapsLinks('12 rue de la Paix,\n75002 Paris');
    expect(l.google).toBe('https://www.google.com/maps/dir/?api=1&destination=12%20rue%20de%20la%20Paix%2C%2075002%20Paris');
    expect(l.apple).toContain('maps.apple.com/?daddr=12%20rue');
    expect(l.waze).toContain('navigate=yes');
  });
  it('affichage : numéro groupé, nom et initiales', () => {
    expect(formatPhone('0123456789')).toBe('01 23 45 67 89');
    expect(formatPhone('+33612345678')).toBe('+33 6 12 34 56 78');
    expect(formatPhone('+41 22 123 45 67')).toBe('+41 22 123 45 67');
    expect(contactName({ firstName: 'Claire', lastName: 'Martin' })).toBe('Claire Martin');
    expect(contactInitials({ firstName: null, lastName: 'martin' })).toBe('M');
  });
});
