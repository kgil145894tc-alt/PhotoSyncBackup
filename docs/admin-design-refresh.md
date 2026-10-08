# Admin design refresh

The five main admin screens now share a pale canvas, white rounded cards, Inter typography, blue actions and a shorter branded header. The floating bottom navigation keeps the existing Home, Requests, Calendar, Services and Profile routes. Client navigation retains its existing presentation.

The navigation bar clears the bottom safe area, uses equal touch targets, and limits its width on tablets. Its reserved space grows when larger text makes labels wrap. The pending-request badge subscribes to the existing admin booking cache and reuses server totals; rendering and changing tabs do not start another count request. Unknown counts show no badge, and logout/account changes clear the cached account scope.

The dashboard adds a Needs attention panel using the exact pending total, dated appointment cards and shortcuts to requests, calendar and notifications. It retains cached cards during refresh and distinguishes unknown counts and failed reads from an empty studio. Appointment details continue to use the existing protected route and server checks.

Requests retain their paginated virtualized list, accurate counts, search, filters and pull-to-refresh. Cards now include both the date and time. Calendar uses a clearer selected day, larger month controls and softer availability cards; month/year controls stack for larger text. Services keep inactive records editable and retain the archive confirmations. Category totals are correctly labelled as packages. Profile groups studio identity, client contacts and session defaults while retaining save validation, drafts, refresh and logout behavior.

No database changes, packages or additional network queries were required. The unused background image layers were removed from these five screens.

## Verification

- All 415 automated tests passed, including new navigation/badge coverage and the existing booking, catalog, calendar, settings, notification and logout regressions.
- Expo lint and TypeScript checks passed.
- Android JavaScript export passed. Metro recovered an unreadable local cache by rebuilding its file map; the export finished successfully.
- Temporary browser previews used copies of the actual screen presentation with synthetic service responses. The previews and fixtures were removed after checking; no real bookings, settings or catalog records were changed.
- All five screens measured 320 pixels wide without horizontal overflow. Floating tabs measured approximately 57 × 56 pixels; catalog edit/delete controls measured 44 × 44 pixels. The 390-pixel previews and 768-pixel dashboard also fit without overflow; tablet statistics use four columns and the navigation remains centered.

Native phone testing remains necessary for Android/iOS safe areas, system text scaling, keyboard behavior and pull-to-refresh. Browser checks and a JavaScript export do not verify these native interactions.

Sample-data previews: [Overview](responsive-previews/admin-overview-floating.png), [Requests](responsive-previews/admin-requests-floating.png), [Calendar](responsive-previews/admin-calendar-floating.png), [Services](responsive-previews/admin-services-floating.png), [Profile](responsive-previews/admin-profile-floating.png).

## Booking details, time slots and catalog forms

Booking Details now uses the same canvas, Inter typography, status colors and white bordered cards as the main admin screens. Client contacts, package information, schedule and session details wrap. Smaller screens and larger system text stack the service, schedule and decision controls. Rejection and result dialogs have bounded scrolling and safe-area padding; the reason form avoids the keyboard.

Calendar time-slot cards use shared status colors and readable time/duration groups. Manage Date groups availability options, with 44-pixel edit/delete controls. Add/Edit Time Slot and notices scroll within the available viewport. A shared keyboard-avoiding container keeps validation notices reachable, and covered time-entry controls are excluded from native screen-reader navigation.

Add/Edit Service and Add/Edit Package share white grouped field cards, inline category selection, image previews and larger inclusion controls. Headers and Save/Cancel footers clear the safe areas; the form body scrolls separately. Validation errors scroll into view immediately without animation. Existing wording, fields, uploads, save handlers, cache behavior and booking/date guards remain intact. No dependencies or database changes were added.

Checked source copies with synthetic catalog, calendar and booking data at 320- and 390-pixel phone widths. Booking Details also fit at 768 pixels. No document-level horizontal overflow was observed. Add Service validation, populated Edit Service/Edit Package fields, Add/Edit Time Slot defaults, time-format validation and the booking rejection dialog were checked. Slot inputs measured 52 pixels high. The temporary preview route, copied components and fixtures were removed; no live records were changed.

The 78 focused booking-detail, admin-calendar, calendar-date-guard and service-catalog tests passed. The 20 service-catalog tests also passed after adding validation scrolling. Final Expo lint and TypeScript checks passed, and Android JavaScript export completed with 2,051 modules. Native keyboard, safe-area and increased-system-text behavior still need verification in an updated Android/iOS build; the existing installed emulator APK showed the older layouts.

Sample-data previews: [Booking Details](responsive-previews/admin-booking-detail.jpg), [Time Slots](responsive-previews/admin-calendar-slots.jpg), [Add Time Slot](responsive-previews/admin-add-time-slot.jpg), [Add Service](responsive-previews/admin-add-service.jpg), [Edit Package](responsive-previews/admin-edit-package.jpg).
