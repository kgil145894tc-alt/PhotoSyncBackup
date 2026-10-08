import { createContext, type ReactNode, useContext, useState } from 'react';
import { createScrollNavigation, type ScrollNavigation } from '@/navigation/scroll-navigation';

const ClientNavScrollContext = createContext<ScrollNavigation | null>(null);

export function ClientNavScrollProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(createScrollNavigation);
  return <ClientNavScrollContext.Provider value={controller}>{children}</ClientNavScrollContext.Provider>;
}

export function useClientNavScrollController() {
  return useContext(ClientNavScrollContext);
}
