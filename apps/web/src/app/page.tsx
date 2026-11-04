import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await currentSession();
  redirect(s?.mfaPassed ? '/tableau-de-bord' : '/connexion');
}
