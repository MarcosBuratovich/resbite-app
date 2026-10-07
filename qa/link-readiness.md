# Invitation link readiness — 17 September 2026

The client and an unpublished fallback template are prepared. Owned HTTPS links are **not active**. No domain, association endpoint, app-store listing or installation URL has been invented or published; tester access remains closed.

## Implemented

- Without configuration, sharing continues to create `resbite://invite?token=…` links for an installed app.
- An explicit `EXPO_PUBLIC_INVITATION_ORIGIN=https://<owned-domain>` switches sharing to `/invite#token=…` on that exact origin. This is a build-time setting, not proof of domain ownership; set it only after the hosting, signing and device checks below. Invalid nonempty configuration fails closed instead of sending secrets to an arbitrary URL.
- HTTPS tokens use fragments, so the browser does not send them to the fallback server. Native intent converts a validated fragment to the existing internal invitation route. Both cold-start and warm native deliveries use the same handler; auth PKCE/recovery callbacks keep their current scheme behavior.
- Link parsing checks the exact origin/scheme/path, a single 64-character lowercase hex token and bounded URL size. It rejects duplicate/unknown/mixed parameters, credentials, ports, encoded tokens, malformed paths and foreign hosts. Pending invitation storage uses the same token validation and retains existing serialized restore/claim protection.
- The fallback offers one explicit Open Resbite action. It removes the fragment from visible browser history, uses no analytics/network APIs/storage, and has no third-party resources. It does not claim an invitation or imply tester access. If the app is missing, it asks the recipient to obtain approved install instructions and reopen the original message after installation. It does **not** provide deferred deep linking through installation.

## Generate artifacts for review

From the repository root, with Node 22 and mobile dependencies installed:

```sh
node --import ./mobile/node_modules/tsx/dist/loader.mjs links/generate.mjs \
  'https://YOUR_OWNED_DOMAIN' 'YOUR_TEAM_ID' 'YOUR_BUNDLE_IDENTIFIER' \
  '/absolute/path/to/new-output-directory'
```

Replace every placeholder with the actual owned domain and release signing values. The generator requires all inputs, accepts only HTTPS public-domain syntax, refuses to overwrite existing files, and makes no network call. It produces:

- `.well-known/apple-app-site-association` limited to `/invite`.
- `invite.html`, `invite.js`, `invite.css` and exact hosting requirements.
- An iOS associated-domains configuration fragment for manual review and merge into app configuration. It does not modify the native project.

The current development bundle identifier is provisional. Verify the Apple application identifier prefix against the signed app's entitlements rather than assuming it always equals the team ID. If the app has a different prefix, use that actual ten-character prefix for the generator's team-ID argument.

## Activation remains blocked on owner/provider setup

1. Confirm the owned domain, final app identifier/application prefix and distribution method. Host the generated association file with JSON content type over HTTPS without redirects/authentication. Serve `/invite` as the fallback HTML, use the specified security headers, and disable query logging/analytics/session replay for this route.
2. Add `ios.associatedDomains` to the app configuration, rebuild/sign/install, and verify Apple's domain association. Only then set the public invitation origin for a test build. Nothing here activates Google, SMTP, auth confirmation/reset redirects or APNs.
3. Test actual iPhone cold start and already-open app from Messages with app installed; repeat while signed out, during profile setup and after restart. A synthetic token can verify routing only; actual claim/RSVP needs approved real accounts later.
4. Test no app installed, denied association, no network, expired/revoked links, malformed and foreign links. After installation, reopen the original message; do not expect automatic recovery from an install website.
5. Test with two approved iPhones before opening tester access. Android association/signing remains a separate future step; this iPhone-first generator intentionally emits no guessed Android certificate fingerprints.

## Evidence

Six automated tests cover strict URL parsing/building, rejection cases, callback preservation, simulated cold-start restore/new-link races and fallback secret handling. Existing eight session lifecycle tests still pass. An intercepted 320-pixel browser check verified the fallback visually, found no horizontal overflow or page errors, confirmed history cleanup and observed only the three same-origin assets with no secret in requests. A local generator run used reserved `links.example.org` and synthetic identifiers in `/private/tmp`; no host was contacted. Native OS association and real-account claims remain unverified until the configuration above exists.

Sources: [Expo 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/), [Expo Router native intent](https://docs.expo.dev/router/advanced/native-intent/), [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains).
