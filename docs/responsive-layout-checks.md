# Responsive layout changes

Replaced the client fixed-coordinate canvas with flexible layouts for Home, Services, package details, My Bookings, and the complete booking flow. Content wraps and scrolls; controls keep their touch target sizes. The legacy portrait route now uses the same package screen.

Shared bottom tabs divide the available width and reserve more height for larger system text. Profile content and logout actions scroll together. Admin Requests and Services scroll as complete panels under their fixed curved headers. Appointment cards, service cards, calendar cells, filters, form controls, and dialogs can grow with their text.

The existing custom font assets now load once in the root layout on Android, iOS, and web. A font loading error falls back to rendering the app instead of leaving the splash screen indefinitely.

## Browser checks

Checked the actual screen components in a temporary development preview, then removed that preview route. No account credentials were needed for these layout checks.

- 320 × 640: Home, Services, booking information, booking schedule, admin dashboard, admin profile. No document-level horizontal overflow was observed.
- 288 × 576: admin calendar kept seven aligned columns.
- 390 × 844: Home headline, subtitle, and booking button occupy separate vertical space; Services has eight naturally sized cards.
- 640 × 360: admin Services keeps a usable scrolling panel below its header.
- 768 × 1024: Services content stays within a centered 720-pixel content area; cards measured 680 pixels wide.
- Scrolling the dashboard kept its brand text at the same vertical position.
- Selecting Next on an empty booking information form still shows the required-name validation message.

Screenshots: [Home](responsive-previews/client-home.png), [Services](responsive-previews/client-services.png).

## Remaining device verification

Web layout checks do not substitute for checking Android/iOS text rendering, keyboard behavior, safe-area insets, and increased system font sizes on real devices. Test these with an existing development build after reloading the JavaScript bundle.

## Build checks

- `npx expo lint`: passed.
- `npx tsc --noEmit`: passed.
- `npx expo export --platform android`: passed with 1,960 modules and all nine custom font assets included.

## Client bookings visual refresh

My Bookings now uses photo cards, muted status colors, schedule panels with date/time icons, filter counts, and an illustrated empty state using the existing photography collage. Booking details use matching cards and show the saved location when available. The Closed filter includes cancelled, rejected, and expired requests; each card retains its individual status. Initial loading uses static card placeholders.

Checked the presentation components with synthetic bookings in a temporary preview route, then removed that route. Browser checks covered 320-pixel and 390-pixel phone widths and a roughly 768-pixel tablet width. Long package names wrapped without horizontal page overflow. Approved and Closed filters returned the expected items; detail Cancel and Reschedule controls reached their callbacks without changing real bookings. Fetching, cancellation, and rescheduling handlers remain in the existing screen.

Previews: [Empty state](responsive-previews/client-bookings-empty.jpg), [Booking cards with sample data](responsive-previews/client-bookings-list.jpg). Native appearance and larger system text still need device verification.

## Client Profile and Edit Profile refresh

Both screens use the same fixed navy header, centered content, white cards, and Inter/Jomolhari typography. Profile has a compact avatar and identity card, readable account details, a bookings shortcut, the existing studio photograph, and a separate logout action. Edit Profile groups the photo controls, personal details, read-only email, and optional password change. The phone field now exposes the phone value already supported by profile saving. Save remains disabled while the initial profile loads or a save is in progress.

Checked the shared presentation with synthetic account data at 320, 390, and 768 pixel browser widths. Long names and email addresses wrapped without page overflow; form fields measured at least 52 pixels high. Field edits, password visibility, cancel, save callbacks, and the logout confirmation were checked. The actual edit screen still shows missing-name and missing-username validation. No real profile, password, avatar, or logout mutation was performed during these checks. Native keyboard avoidance and gallery selection still need device testing.

Previews with sample data: [Profile](responsive-previews/client-profile.jpg), [Edit Profile](responsive-previews/client-profile-edit.jpg).

## Notifications

Client and admin now share a fixed curved navy header, unread count, All/Unread filters, full notification messages, date groups, and status icons. Unread cards have a pale blue background and a blue dot. Booking cards open their related booking; client My Bookings accepts a bookingId parameter and shows that booking's details. The former client sample-notification fallback was removed.

The inbox loads 30 updates initially, with a Show older updates action. Unread filtering happens on the server, and the badge counts unread notifications across the account rather than just the first page. Existing cards stay visible during focus and manual refresh; an initial load uses skeleton cards. Errors preserve the list and offer Refresh. Successful read updates invalidate older in-flight requests. Mark all as read verifies the database result and reports a failed or incomplete update.

Checked the shared view and actual inbox hook using a temporary preview with synthetic data and controlled service responses, then removed the route. Measured browser widths of 320, 390, and 768 pixels without horizontal page overflow; primary controls measured at least 44 pixels high. Verified older unread items, Show older updates, a read update during a delayed refresh, failed individual reads, refresh failures preserving cards, initial failure/retry, initial skeletons, and both empty states. Booking callbacks received the expected booking id. Authenticated destination screens and native pull-to-refresh still need a device check; no real account notifications were changed during browser testing.

Service checks: `node --test scripts/notifications.test.cjs` covers seven cases including account scoping, server-side unread filtering, complete messages, total unread count, failed queries, signed-out requests, and batch/individual read results.

Previews with sample data: [Client notifications](responsive-previews/client-notifications.jpg), [Admin notifications](responsive-previews/admin-notifications.jpg).

## Dashboard highlights

Kept the existing client dashboard design. Highlights now reads up to three active services with uploaded cover photos from Admin Services, uses their actual names, and links each card to its matching service. It excludes entries without an image or route and does not substitute bundled sample highlights. A first load uses skeletons; failed refreshes keep any visible cards and offer a retry. A successful empty response shows an explanatory empty state. Three equal columns keep images consistent on narrow screens and names wrap without a line limit.

Checked the actual Home component in a temporary preview against the project's published catalog. Self-Portrait Studio, Portrait Photography, and Graduation Photography appeared with their uploaded Supabase photos; all three images finished loading. Checked a measured 320 pixel browser width without horizontal overflow. Removed the preview route and its temporary catalog fixture afterwards. No catalog entries were changed.

Preview with real catalog content: [Client dashboard highlights](responsive-previews/client-home-real-highlights.jpg).
