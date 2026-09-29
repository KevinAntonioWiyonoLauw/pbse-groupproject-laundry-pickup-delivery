'use client';

import { useEffect, useState } from 'react';
import { currentSession, validSession, type Session } from './auth';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await validSession();
      } catch {
        // A failed refresh clears the session; the page will show sign-in.
      }
      if (active) {
        setSession(currentSession());
        setLoading(false);
      }
    };
    void load();
    const sync = () => setSession(currentSession());
    window.addEventListener('session-changed', sync);
    return () => {
      active = false;
      window.removeEventListener('session-changed', sync);
    };
  }, []);

  return { session, loading };
}
