import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protection optionnelle de tout le site par mot de passe (authentification HTTP « Basic »),
 * utile pour un site de démonstration : définir BILANX_BASIC_AUTH="utilisateur:motdepasse".
 * Sans cette variable, rien n'est bloqué. Le contrôle de santé reste accessible à l'hébergeur.
 */
export function proxy(request: NextRequest) {
  const expected = process.env.BILANX_BASIC_AUTH;
  if (!expected || request.nextUrl.pathname === '/api/sante') return NextResponse.next();
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length === b.length && timingSafeEqual(a, b)) return NextResponse.next();
  return new NextResponse('Accès réservé.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="BILANX (démonstration)", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
