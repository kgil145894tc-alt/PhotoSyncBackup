# Intro and authentication design refresh

The intro keeps the existing landscape photograph and centers the PhotoSync logo, wordmark and original tagline. Its floating action card contains only Login and Create Account. Promotional headlines, helper paragraphs and the extra panel copy have been removed.

Login and Create Account use the same photograph behind muted slate-blue cards and deeper navy fields. Each form keeps its functional Login/Create Account title, labels, controls, required messages and alternate-account link. The welcome, story, account eyebrow and booking-description copy has been removed. Password and confirmation fields retain independent Show/Hide controls, initial masking and current/new-password autofill hints. Forms remain scrollable, respect safe-area insets and preserve keyboard avoidance.

The theme uses `#1C334B` cards, `#12263B` fields and a soft `#89B4D8` primary action with dark text. Main text has 11.10:1 contrast against the card, muted text 7.64:1, and primary button text 7.03:1. Control borders are separate from decorative card borders; focus, links, checkbox marks, placeholders and reset feedback use the dark palette too. Contrast calculations do not replace a native visual or accessibility check.

The reset-password dialog uses the same styling and scrolls on shorter screens. Reset errors now appear inside the dialog; a confirmed send still closes it and displays the existing success message on the login page.

## Preserved behavior

The signed-in redirect guard still runs before intro, login or signup content appears. Authentication services, role selection, signup fields, email confirmation, password matching and required privacy consent retain their existing behavior. The new Back control returns to the intro through Expo Router. Form editing and navigation controls are disabled during submission, and password visibility changes do not alter the entered value.

No dependencies, Supabase schema, authentication service or native project files were changed for this refresh.

## Verification

- `node --test scripts/*.test.cjs`: all 440 tests passed on the final dark theme, including the existing authentication checks for login payloads and client/admin redirects, pending controls, registration consent and password matching, reset feedback, password masking/autofill and navigation destinations. No new tests were added for this palette and copy revision.
- `npx expo lint` and `npx tsc --noEmit`: passed on the final source.
- `npx expo export --platform android --output-dir tmp/auth-minimal-android`: passed. This checks the Android JavaScript/Hermes bundle, not a complete native build. A Windows temporary-folder permission failure was resolved by using a project-local temporary directory for the export process.
- Source review confirmed removal of the requested promotional copy and bright white surfaces. Calculated text and control contrast is documented above. Safe-area padding, scroll and keyboard behavior, submission guards and minimum touch targets remain in the code.
- A fresh browser visual check could not be completed: the preview encountered connection timeouts and remained on its startup loader after recovering. The task's development server was stopped and the temporary viewport override was reset. Current phone rendering still needs verification.

Earlier light-theme layout verification covered 320 × 640, 390 × 844, 768 × 1024 and 640 × 360, plus empty-form validation, password visibility, alternate-account navigation and Back. Those checks predate the current colors and minimal intro layout. No real credentials, terms acceptance, account creation or reset emails were used during browser verification; successful account actions used service mocks in the regression tests.

Historical light-theme previews (not the current design): [Intro](responsive-previews/auth-intro.png), [Login](responsive-previews/auth-login.png), [Create Account](responsive-previews/auth-create-account.png), [Complete registration form after scrolling](responsive-previews/auth-create-account-form.png), [Reset password](responsive-previews/auth-reset-password.png).

Native Android/iOS checks remain for keyboard avoidance, password-manager autofill, safe areas and larger system text.
