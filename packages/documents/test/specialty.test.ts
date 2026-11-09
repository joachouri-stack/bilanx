import { describe, expect, it } from 'vitest';
import { guessSpecialty } from '../src';

describe('guessSpecialty', () => {
  it('reconnaît le médecin ou le matériel prescrit', () => {
    expect(guessSpecialty('Dr Martin\nOphtalmologue\nVerres correcteurs : OD -1,25')).toBe('ophtalmologie');
    expect(guessSpecialty('Service de diabétologie\nCapteurs FreeStyle Libre 2 : 2 par mois\nInsuline Lantus')).toBe('endocrinologie');
    expect(guessSpecialty('Docteur Durand, neurologue\nÉlectroencéphalogramme normal')).toBe('neurologie');
    expect(guessSpecialty('Médecine vasculaire\nXarelto 20 mg : 1 cp le soir\nBas de contention')).toBe('thrombose');
    expect(guessSpecialty('Cabinet O.R.L. du centre\nAudiogramme')).toBe('orl');
  });
  it('ne devine rien sans indice ou en cas d’égalité', () => {
    expect(guessSpecialty('Paracétamol 1 g, 3 fois par jour')).toBeNull();
    expect(guessSpecialty('Cardiologue\nDermatologue')).toBeNull();
  });
});
