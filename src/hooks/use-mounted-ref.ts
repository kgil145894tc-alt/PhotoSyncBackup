import { useEffect, useRef } from 'react';

// Async UI handlers can finish after navigation or an account change.
export function useMountedRef() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}
