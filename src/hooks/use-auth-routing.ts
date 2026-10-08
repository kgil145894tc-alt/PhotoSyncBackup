import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { getSignedInUserRole } from '@/services/auth';
import { type UserRole } from '@/types/auth';

type AuthRoutingState = { isLoading: boolean; role: UserRole | null };

// Subscribe once at the root. Stack.Protected owns every auth transition;
// screens must not replace routes while nested navigators are being removed.
export function useAuthRoutingState() {
  const [state, setState] = useState<AuthRoutingState>({ isLoading: Boolean(supabase), role: null });

  useEffect(() => {
    if (!supabase) return;

    let isActive = true;
    let checkVersion = 0;
    let accountId: string | null | undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isActive) return;
      const nextAccountId = session?.user.id ?? null;

      if (event === 'SIGNED_OUT' || !nextAccountId) {
        checkVersion += 1;
        accountId = null;
        setState({ isLoading: false, role: null });
        return;
      }

      if (accountId === nextAccountId) return;
      accountId = nextAccountId;
      const requestVersion = ++checkVersion;
      // Revoke the old account's access without replacing the root navigator.
      setState((previous) => ({ isLoading: previous.isLoading, role: null }));

      // Supabase calls must run after the auth callback has released its lock.
      setTimeout(() => {
        if (!isActive || requestVersion !== checkVersion) return;
        void getSignedInUserRole().catch(() => null).then((role) => {
          if (isActive && requestVersion === checkVersion) {
            // A failed read must be retryable when Login emits SIGNED_IN again.
            if (!role) accountId = undefined;
            setState({ isLoading: false, role });
          }
        });
      }, 0);
    });

    return () => {
      isActive = false;
      checkVersion += 1;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
