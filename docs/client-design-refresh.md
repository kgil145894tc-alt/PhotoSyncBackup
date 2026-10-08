# Client design refresh

The five main client screens now use a floating white navigation bar with blue selection, outline icons and the existing Home, Services, Booking, About and Profile destinations. It uses the same visual styles as the admin bar. Pressing the selected tab does not add another navigation entry.

The shared navigation-height hook reserves the floating gap and space for wrapped labels at larger system text sizes. Existing page and list footer padding uses that height; Home also gains 24 pixels of content clearance. Booking steps, service details, notifications and profile editing retain their existing navigation visibility rules.

Visual changes are limited to shared client card corners, service thumbnails, primary button corners, and About quote, service and contact cards. Existing photos, brand fonts, page structure, caching, authentication and booking actions are retained. The bar adds no data fetching or admin-count subscription to the client.

## Verification

- All 419 regression tests passed, including four new client navigation tests and the existing admin, booking, authentication and cache checks.
- `npx expo lint` and `npx tsc --noEmit` passed after temporary preview files were removed.
- `npx expo export --platform android --output-dir tmp/client-design-android` passed. This validates the Android JavaScript bundle, rather than a complete native build.
- Browser previews checked all five pages at widths of 320, 390 and 768 pixels. Tabs stayed within the frame, retained selection and had targets at least 44 pixels wide and high. The tablet bar stayed capped at 560 pixels.
- Scrolling cleared the last Home highlight, service card, booking card, About footer and Profile logout button above the bar. The preview console reported no errors.

The previews in `docs/responsive-previews/client-*-floating.png` use existing assets and synthetic catalog, booking and profile data, rather than production account data. The temporary preview route, fixture modules and development server were removed or stopped after review.

Native Android/iOS checks are still needed for system safe areas, larger system text, keyboard behavior and navigation through a complete booking flow.

The subsequent scrolling-navigation change and its 433-test verification are recorded in [Client scrolling navigation](client-scroll-navigation.md).
