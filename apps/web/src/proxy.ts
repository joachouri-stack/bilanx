import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Fichiers publics de l'application installable, sans aucune donnée : le navigateur les télécharge
 * SANS identifiants (manifeste, icônes, service worker) ; protégés, l'installation échouerait.
 */
const PUBLIC_FILES = new Set(['/api/sante', '/manifest.webmanifest', '/sw.js', '/hors-ligne.html', '/icon.svg']);

/**
 * Protection optionnelle de tout le site par mot de passe (authentification HTTP « Basic »),
 * utile pour un site de démonstration : définir BILANX_BASIC_AUTH="utilisateur:motdepasse".
 * Sans cette variable, rien n'est bloqué. Le contrôle de santé reste accessible à l'hébergeur, ainsi que les
 * fichiers publics de l'application installable (`PUBLIC_FILES`).
 *
 * Une fois le mot de passe accepté, un cookie de passage (un an) évite de le redemander à chaque ouverture
 * (Safari et l'application installée l'oublient sinon). Il est dérivé du mot de passe et de BILANX_SECRET_KEY :
 * changer le mot de passe de démonstration invalide tous les cookies existants.
 */
const SECURE = process.env.NODE_ENV === 'production' && !(process.env.BILANX_APP_URL ?? '').startsWith('http://');
const PASS_COOKIE = SECURE ? '__Host-bilanx_demo' : 'bilanx_demo';
const PASS_MAX_AGE = 365 * 86400;

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function demoPass(expected: string, secret = process.env.BILANX_SECRET_KEY ?? ''): string {
  return createHmac('sha256', `bilanx-demo:${secret}`).update(expected).digest('base64url');
}

export function proxy(request: NextRequest) {
  const expected = process.env.BILANX_BASIC_AUTH;
  const path = request.nextUrl.pathname;
  if (!expected || PUBLIC_FILES.has(path) || path.startsWith('/icons/')) return NextResponse.next();
  const pass = demoPass(expected);
  const cookie = request.cookies.get(PASS_COOKIE)?.value ?? '';
  if (cookie && same(cookie, pass)) return NextResponse.next();
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  if (same(given, expected)) {
    const res = NextResponse.next();
    res.cookies.set(PASS_COOKIE, pass, { httpOnly: true, secure: SECURE, sameSite: 'lax', path: '/', maxAge: PASS_MAX_AGE });
    return res;
  }
  return new NextResponse('Accès réservé.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="BILANX (démonstration)", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
