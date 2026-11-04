import { NextResponse } from 'next/server';
import { takeNext } from '@/lib/server/auth';

/** Après l'activation de la MFA : reprend la page demandée avant la connexion (ex. invitation). */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL(await takeNext(), request.url));
}
