# Client Home highlights cache

Home uses an account-scoped, in-memory snapshot for the three published service photos. Successful snapshots, including an empty list, stay fresh for 60 seconds. Opening Home again within that window reuses them. Stale focus or app resume starts one background request; concurrent focus, resume and retry calls share the same pending request.

The narrow `services` query selects only IDs, names, slugs and uploaded image URLs in stable 12-row pages, stopping after three valid published photos. Home does not download packages to display highlights or use bundled sample photos. The unused synchronous catalog getters have been removed; Home retains its own account-scoped snapshot. The notification count remains in its existing independent cache.

The store subscribes to authentication and catalog events outside rendering. Logout and account changes clear photos, errors, freshness and pending request ownership immediately. Late responses from an earlier session cannot repopulate the snapshot, including logout followed by login to the same account. Same-account token refreshes preserve the cache. Reads start in a focus effect, never during render or inside the auth callback.

Local service/image saves invalidate freshness even when Home is closed. While Home is focused, they also start a read. Confirmed service deactivation/deletion removes that card immediately. A catalog event during a pending read discards that read's obsolete result or error and reads again. Package activation/deactivation alone does not affect highlights. Generic catalog save events still invalidate them.

Cached photos remain visible during refresh and on failure. Initial loading, a successful empty response and an initial error are distinct. Only errors show **Try again**; no permanent refresh button is added. Selecting a card resolves its latest cached ID and slug, and ignores callbacks retained from a previous account or a removed card.

The 60-second window is checked on focus/resume; it is not a polling interval. Changes made on another device appear on a stale focus/resume or explicit retry after an error. No realtime subscription, dependency, SQL, native configuration or deployment is introduced.

## Automated checks

```powershell
node --test scripts/client-home-highlights-cache.test.cjs scripts/notification-unread-count.test.cjs
node --test scripts/*.test.cjs
npx expo lint
npx tsc --noEmit
```

Regression coverage includes freshness boundaries and empty snapshots, pending-request sharing, background errors/retry, event races, account changes, published-image query filtering, focus/resume cleanup, Home card navigation and independent notification retries.

## Physical device verification (pending)

- On Android and iOS, open Home, visit another screen, then return within 60 seconds. Photos should remain visible without another highlights request.
- Return after 60 seconds or resume the app with Home focused. Photos should remain visible while one request updates them.
- Go offline after a successful load, return with a stale cache, then retry after reconnecting. Keep the previous photos through the failed read.
- Verify a studio with no uploaded photos shows the empty message; an initial network failure shows the retry message without sample photos.
- Save or deactivate a service, then return to Home. Verify changed photos appear and removed services disappear.
- Logout during a slow read, then login to the same or another account. Previous photos must not return from the old response.
- Verify notification badge updates/retry, service card navigation and the Book a session button still work.
