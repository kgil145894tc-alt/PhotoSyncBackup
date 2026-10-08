# Mobile motion

All wording, route names, booking validation and server requests retain their existing behavior. No dependencies or native modules were added.

- Main client and photographer tabs reveal the destination immediately, with opacity moving from 0.9 to 1 over 140 ms. Controls remain usable and animations do not hold interactions or virtualized lists.
- Detail and booking steps use native stack transitions, including reverse navigation. iOS simple push is 240 ms; Android uses the platform's slide-from-right timing. Auth transitions stay disabled at the root.
- Booking action buttons scale to 0.98 while pressed. Newly selected calendar days and time slots settle from 0.97 to 1 over 140 ms, keeping layout and touch targets intact.
- Booking review displays a spinner with the existing Submitting... label. A ref prevents same-frame duplicate requests; failed requests release the lock, and success navigates without an artificial delay.
- Booking success fades the icon and copy while the icon gently scales from 0.92 to 1. The complete sequence takes at most 420 ms and never blocks Back to Home.

The shared Reduce Motion preference defaults to motion disabled until the device responds. It observes changes, ignores stale async reads, and removes listeners when unused. Effects stop on blur/unmount; tabs and controls reset to their final visible state when motion is reduced.

Verification covers preference changes and cleanup, interrupted transitions, duplicate submission/failure recovery, booking/calendar/catalog validation, and root auth routing. On Android, manually check rapid tab switches, booking forward/back (including system back), date/slot selection, double confirm taps, success, Reduce Motion, and login → logout → login. Automated mocks do not measure native frame rate.

Development builds load these JavaScript changes from Metro. Existing standalone preview APKs need a new build to include them.

API references: [Expo SDK 57 Stack](https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/), [React Native Animated](https://reactnative.dev/docs/0.86/animated), [AccessibilityInfo](https://reactnative.dev/docs/0.86/accessibilityinfo).
