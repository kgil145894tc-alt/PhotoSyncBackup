const clientTabs = new Set(['home', 'services', 'book', 'about', 'profile']);
const photographerTabs = new Set(['index', 'requests', 'calendar', 'calendar-slots', 'services', 'profile']);

export function isMainTabScreen(name: string, area: 'client' | 'photographer') {
  return (area === 'client' ? clientTabs : photographerTabs).has(name);
}

export function getScreenMotionOptions(name: string, area: 'client' | 'photographer',
  reduceMotion: boolean, platform: string) {
  // Main tabs use a short content fade; auth navigation keeps its existing options.
  if (reduceMotion || isMainTabScreen(name, area) || name === 'book/success') {
    return { animation: 'none' as const, headerShown: false };
  }
  // iOS allows duration customization for simple_push; Android uses native timing.
  return { animation: platform === 'ios' ? 'simple_push' as const : 'slide_from_right' as const,
    ...(platform === 'ios' ? { animationDuration: 240 } : {}), headerShown: false };
}
