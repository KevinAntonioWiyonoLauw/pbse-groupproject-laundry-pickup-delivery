'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeLogin } from '../../src/lib/auth';
import { apiMessage } from '../../src/lib/error-message';
import { ErrorState } from '../../components/ui/error-state';
import { LoadingState } from '../../components/ui/loading-state';

export default function CallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    completeLogin().then((returnTo) => { if (active) router.replace(returnTo); }).catch((reason: unknown) => { if (active) setError(apiMessage(reason)); });
    return () => { active = false; };
  }, [router]);
  return error ? <ErrorState message={error} retry={() => router.replace('/')} /> : <LoadingState />;
}
