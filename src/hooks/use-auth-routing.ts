import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { getSignedInUserRole } from '@/services/auth';
import { type UserRole } from '@/types/auth';

export function useProtectedRole(requiredRole: UserRole) {
  const [isCheckingRole, setIsCheckingRole] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function checkRole() {
      setIsCheckingRole(true);

      const role = await getSignedInUserRole().catch(() => null);

      if (!isActive) {
        return;
      }

      if (!role) {
        setIsCheckingRole(false);
        router.replace('/login');
        return;
      }

      if (requiredRole === 'admin' && role !== 'admin') {
        setIsCheckingRole(false);
        router.replace('/home');
        return;
      }

      if (requiredRole === 'client' && role === 'admin') {
        setIsCheckingRole(false);
        router.replace('/photographer');
        return;
      }

      setIsCheckingRole(false);
    }

    void checkRole();

    return () => {
      isActive = false;
    };
  }, [requiredRole]);

  return isCheckingRole;
}

export function useRedirectSignedInUser() {
  useEffect(() => {
    let isActive = true;

    async function redirectSignedInUser() {
      const role = await getSignedInUserRole().catch(() => null);

      if (!isActive) {
        return;
      }

      if (role === 'admin') {
        router.replace('/photographer');
        return;
      }

      if (role === 'client') {
        router.replace('/home');
      }
    }

    void redirectSignedInUser();

    return () => {
      isActive = false;
    };
  }, []);
}
