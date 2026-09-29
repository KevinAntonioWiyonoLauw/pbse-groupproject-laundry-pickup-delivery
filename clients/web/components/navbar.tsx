'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { roleOf, signOut } from '../src/lib/auth';
import { useSession } from '../src/lib/use-session';
import { Button } from './ui/button';
import { LoginButton } from './ui/login-button';

export default function Navbar() {
  const router = useRouter();
  const { session } = useSession();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4 md:px-8">
      <Link className="text-lg font-extrabold text-primary-600" href="/">🧺 Laundry</Link>
      <nav className="flex items-center gap-4 text-sm font-semibold text-neutral-700">
        {session ? <><Link className="transition hover:text-primary-600" href="/orders">Orders</Link>{roleOf(session) === 'customer' ? <Link className="transition hover:text-primary-600" href="/orders/new">Order baru</Link> : <Link className="transition hover:text-primary-600" href="/pickups">Pickup</Link>}
          <Button variant="secondary" size="sm" onClick={() => void signOut(() => router.replace('/'))}>Keluar</Button>
        </> : <>
          <Link className="transition hover:text-primary-600" href="/orders">Dashboard</Link>
          <LoginButton size="sm">Masuk</LoginButton>
        </>
        }
      </nav>
    </header>)
    ;
}
