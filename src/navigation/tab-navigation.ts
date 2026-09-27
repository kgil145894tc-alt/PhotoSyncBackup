import { useSyncExternalStore } from 'react';

export type ClientTabRoute = '/home' | '/services' | '/book' | '/about' | '/profile';
export type PhotographerTabRoute =
  | '/photographer'
  | '/photographer/calendar-slots'
  | '/photographer/requests'
  | '/photographer/calendar'
  | '/photographer/services'
  | '/photographer/profile';
export type TabRoute = ClientTabRoute | PhotographerTabRoute;
export type TabIconName =
  | 'home'
  | 'services'
  | 'book'
  | 'about'
  | 'profile'
  | 'dashboard'
  | 'requests'
  | 'calendar'
  | 'clients'
  | 'notifications';
export type StackSlideAnimation = 'slide_from_left' | 'slide_from_right';

export type TabItem = {
  accessibilityLabel: string;
  icon: TabIconName;
  label: string;
  route: TabRoute;
};

export const CLIENT_TAB_ITEMS: TabItem[] = [
  { accessibilityLabel: 'Home page', icon: 'home', label: 'HOME', route: '/home' },
  { accessibilityLabel: 'Services', icon: 'services', label: 'SERVICES', route: '/services' },
  { accessibilityLabel: 'Booking', icon: 'book', label: 'BOOKING', route: '/book' },
  { accessibilityLabel: 'About us', icon: 'about', label: 'ABOUT', route: '/about' },
  { accessibilityLabel: 'Profile', icon: 'profile', label: 'PROFILE', route: '/profile' },
];

export const PHOTOGRAPHER_TAB_ITEMS: TabItem[] = [
  { accessibilityLabel: 'Admin home', icon: 'home', label: 'HOME', route: '/photographer' },
  { accessibilityLabel: 'Booking requests', icon: 'requests', label: 'REQUESTS', route: '/photographer/requests' },
  { accessibilityLabel: 'Calendar', icon: 'calendar', label: 'CALENDAR', route: '/photographer/calendar' },
  { accessibilityLabel: 'Services', icon: 'services', label: 'SERVICES', route: '/photographer/services' },
  { accessibilityLabel: 'Profile', icon: 'profile', label: 'PROFILE', route: '/photographer/profile' },
];

export const TAB_ITEMS = CLIENT_TAB_ITEMS;
export const TAB_ROUTES = new Set<TabRoute>([
  ...CLIENT_TAB_ITEMS.map((item) => item.route),
  ...PHOTOGRAPHER_TAB_ITEMS.map((item) => item.route),
]);

let stackSlideAnimation: StackSlideAnimation = 'slide_from_right';
const listeners = new Set<() => void>();

export function getTabRouteIndex(pathname: string) {
  const tabItems = getTabItems(pathname);
  if (pathname === '/photographer/calendar-slots') {
    return tabItems.findIndex((item) => item.route === '/photographer/calendar');
  }

  const exactIndex = tabItems.findIndex((item) => pathname === item.route);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  return tabItems.findIndex((item) => pathname.startsWith(`${item.route}/`));
}

export function isPathInTabSection(pathname: string) {
  return getTabItems(pathname).some((item) => isPathInTabRoute(pathname, item.route));
}

export function isBottomNavVisible(pathname: string) {
  return getTabItems(pathname).some((item) => pathname === item.route) || pathname === '/photographer/calendar-slots';
}

export function getTabItems(pathname: string) {
  return pathname.startsWith('/photographer') ? PHOTOGRAPHER_TAB_ITEMS : CLIENT_TAB_ITEMS;
}

function isPathInTabRoute(pathname: string, route: TabRoute) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function setStackSlideAnimation(animation: StackSlideAnimation) {
  stackSlideAnimation = animation;
  listeners.forEach((listener) => listener());
}

export function useStackSlideAnimation() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return stackSlideAnimation;
}
