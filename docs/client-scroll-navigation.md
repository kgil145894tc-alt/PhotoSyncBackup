# Scrolling navigation and active indicators

The client floating bar on Home, Services, Booking, About and Profile slides below the screen after scrolling down, and returns on upward scrolling or when a page receives focus. The admin bar shares this behavior on Home, Requests, Calendar, time slots, Services and Profile. Both bars slide their active highlight to the selected tab; screen transitions are unchanged by this update.

## Behavior and scope

- Downward movement accumulates 32 logical pixels before hiding; upward movement accumulates 12 before showing. Within 12 pixels of the top, the bar stays visible. Pages with no more than 32 pixels of scrollable content also keep it visible.
- The controller clamps top and bottom overscroll to the real content range. Small reversals and fractional movements do not cause flicker. Layout changes and content updates reset its direction baseline.
- The client and admin layouts each own an independent controller. Focus activates the current scroll surface and restores the bar; inactive screens and their late events cannot control it. Tracking uses refs and only visibility transitions notify the navigation component.
- Only the main vertical scroll surface controls the bar, including the booking list and booking detail mode. Horizontal filters and modal contents do not control it. Existing content padding, refresh handlers, list virtualization, routing, caches and booking actions are preserved.
- Translation uses the native animation driver on Android/iOS and the web driver in browser previews. Animations do not hold an interaction handle that delays virtualized list rendering. Hidden tabs have touch, keyboard and accessibility interaction disabled.
- Native screen readers keep the bar visible. Reduced-motion settings skip the animation. Preference listeners are cleaned up and late asynchronous queries cannot update unmounted components. React Native Web's screen-reader query reports true unconditionally, so it is not used to detect native screen-reader settings on web.
- The active highlight follows the current route, including back navigation. Its spring retargets from its current position on rapid tab changes, adapts to bar width changes, and snaps immediately when reduced motion is enabled. The decorative highlight cannot intercept touches or create accessibility targets.

## Verification

The admin scrolling and active-indicator update passed 148 related tests covering navigation, scrolling, motion, admin screens, pagination and notification badges. `npx expo lint` and `npx tsc --noEmit` passed. Indicator checks include resizing, interrupted springs, reduced motion and the web animation driver. Device testing of this update remains outstanding.

### Earlier client-only verification

- `node --test scripts/*.test.cjs`: all 433 tests passed. The new checks cover direction thresholds, bounce, short content, resizing, fractional scrolling, focus changes, inactive events, animation cleanup, accessibility preferences, unmount safety and hidden-tab interaction. Existing authentication, booking, notification, cache and admin regressions also passed.
- `npx expo lint` and `npx tsc --noEmit` passed.
- `npx expo export --platform android --output-dir tmp/client-scroll-android` passed after temporary preview routes and fixtures were removed. This validates the Android JavaScript bundle, not a full native build.
- Browser previews verified downward hiding and upward return on all five client pages at 390 pixels. Services also passed at 320 and 768 pixels; tabs stayed within the frame and retained touch targets of at least 44 pixels. An empty booking filter kept the bar visible.
- Sample-data Home screenshots are saved as `responsive-previews/client-scroll-hidden.png` and `responsive-previews/client-scroll-shown.png`. The temporary preview tab was closed, its viewport override reset, and the task's development server stopped.

Native Android/iOS checks remain for momentum scrolling, pull-to-refresh, rapid page changes, system safe areas, reduced motion and screen readers.
