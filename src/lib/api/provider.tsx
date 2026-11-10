'use client';

import { useEffect, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { fetcher, isApiError, setSignedOutHandler } from './client';

/** Where to send someone whose session has ended. Staff screens go to the staff sign-in, everything else to the customer one. */
function toSignIn() {
  const path = window.location.pathname;
  if (path === '/login' || path === '/staff/login') return;
  const staff = path.startsWith('/cashier') || path.startsWith('/owner');
  window.location.assign(`${staff ? '/staff/login' : '/login'}?next=${encodeURIComponent(path)}`);
}

/**
 * Data loading for every app: one fetcher, sensible retries, and a single rule for a signed-out session (401), for reads and
 * for writes alike: go to the sign-in screen. A 4xx other than that is the screen's to handle, so it is not retried.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setSignedOutHandler(toSignIn);
    return () => setSignedOutHandler(undefined);
  }, []);

  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 2000,
        errorRetryCount: 2,
        shouldRetryOnError: (e) => !isApiError(e) || e.status === 0 || e.status >= 500,
      }}
    >
      {children}
    </SWRConfig>
  );
}
