# Password reset across devices

Android and web send reset emails to the same HTTPS page, with a presentation-only source marker:

* Web: `https://kirl123-photosync.expo.app/reset-password?source=web`
* Android: `https://kirl123-photosync.expo.app/reset-password?source=app`

The recipient can open the email on another phone or computer without installing PhotoSync. The website accepts the recovery tokens, updates the same Supabase account, ends the recovery session, and stays on a success page. The new password can then be used in the Android app or website.

There is no Open in PhotoSync button or automatic app/browser navigation after success. Requests from web show Back to Login; requests from Android instead say to return to PhotoSync and log in. Older links without a source marker use the web presentation. The marker does not authenticate the user or identify a device.

In Supabase Authentication → URL Configuration → Redirect URLs, allow both exact HTTPS URLs above, including their source query parameters. Keep the original reset URL allowed for older emails. If a custom recovery email template is configured, ensure its link uses `{{ .ConfirmationURL }}` so Supabase verifies the recovery request before redirecting. Keep the recovery link's tokens intact; do not replace the email link with a plain website URL.

Deploy the updated website and distribute a new Android build containing this change. Previously sent emails retain their original redirect; request a fresh email from the updated app.

Manual verification: request a reset from Android, open the fresh email on a computer without PhotoSync, update the password, and sign in on Android with the new password. Also test a request from web and an expired link. Never copy recovery tokens into logs or documentation.
