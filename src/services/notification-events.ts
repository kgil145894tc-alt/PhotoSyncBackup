const listeners = new Set<() => void>();

export function emitNotificationsChanged() {
  listeners.forEach((listener) => listener());
}

export function subscribeToNotificationsChanged(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
