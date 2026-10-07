# Sign-in setup — 18 September 2026

Owner selected **resbite.com** and is setting up the providers. This document prepares that setup; it does not activate the domain, send email, enable Google or open tester access. Use the existing Supabase project `ewcsgvhuojxdpaspwsrx`.

## Read-only configuration check

The hosted public Auth settings endpoint was read on 18 September using the existing local publishable key. Only these booleans were retained:

| Setting | Observed |
| --- | --- |
| Email provider | Enabled |
| Email confirmation | Required (`mailer_autoconfirm=false`) |
| Google provider | Disabled |
| Anonymous sign-in | Disabled |
| Auth registrations | Enabled (`disable_signup=false`) |

Auth registration and Resbite tester approval are separate. The database roster gate must remain closed; registering or confirming an email does not grant access to Resbite data. The public endpoint does not establish SMTP configuration, allowed redirects, sender verification or Google credentials. Those settings still require dashboard verification. No account was created and no email was sent by this check.

## Google setup for the current mobile flow

Resbite currently opens Supabase OAuth in the native system browser and exchanges a PKCE code. It does not use Google's native SDK.

1. In the owner's Google Cloud project, configure the consent screen/branding for Resbite and the owned domain `resbite.com`. Keep the Google audience limited during setup. Google test users are separate from Resbite's database tester roster.
2. Create an OAuth client of type **Web application** for this browser-mediated flow. Configure basic identity scopes only: `openid`, email and profile.
3. Set this exact **Google authorized redirect URI**:

   ```text
   https://ewcsgvhuojxdpaspwsrx.supabase.co/auth/v1/callback
   ```

4. Enter the client ID and secret in the existing project's [Google provider settings](https://supabase.com/dashboard/project/ewcsgvhuojxdpaspwsrx/auth/providers). Keep the secret in the dashboard, never in `EXPO_PUBLIC_*`, this repository or chat. Enabling the provider is a separate live configuration step once these values are ready.

Google returns to Supabase first; Supabase then returns to the installed app. Do not put `resbite://auth/callback` in Google's authorized redirect URI field. For any future hosted web client, its JavaScript origin is a separate setting; the development browser preview does not currently support Google login. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Supabase app redirects

Review the existing project's [URL configuration](https://supabase.com/dashboard/project/ewcsgvhuojxdpaspwsrx/auth/url-configuration). The current app explicitly requests these destinations:

| Flow | App destination |
| --- | --- |
| Registration confirmation / Google | `resbite://auth/callback` |
| Password recovery | `resbite://auth/callback?recovery=1` |

Allow these exact destinations for the installed development app and verify the recovery query survives the real email return. The code supplied by Supabase is added during the return; it is not a fixed allow-list entry. Avoid a broad wildcard when exact routes suffice. Site URL is a fallback and does not replace explicit `redirectTo` / `emailRedirectTo` values. See [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

`https://resbite.com` is the chosen domain, not a verified callback implementation. Do not switch Auth redirects or `EXPO_PUBLIC_INVITATION_ORIGIN` to it yet. The prepared association generator only claims `/invite`; it does not implement an HTTPS Auth callback. Domain hosting, native association, signing/rebuild and device acceptance are still needed. See [link readiness](link-readiness.md). A branded Supabase API/Auth subdomain is optional separate infrastructure, not automatically supplied by owning resbite.com.

## Email provider setup

1. Verify `resbite.com` or a chosen sending subdomain with the selected provider. Add that provider's exact DNS records; do not guess SPF/DKIM values. Confirm its sender verification and authentication checks.
2. Choose a sender mailbox and display name. `Resbite` is the intended brand; the mailbox remains an owner/provider decision, not a provisioned address.
3. Enter SMTP host, port, username/password and verified sender in the project's Auth SMTP settings. Keep credentials server-side. Confirm provider and Supabase rate limits before device acceptance. Supabase's default mail service is restricted and is not evidence of production delivery. See [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
4. Keep signup confirmation and password recovery templates using the Supabase-generated `{{ .ConfirmationURL }}` for the current flow. Do not replace those links with a bare `https://resbite.com` URL or a token-hash route that the app does not implement. Disable email-provider link tracking/rewrite for Auth messages and verify links survive the chosen email clients. See [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
5. Before enabling the separate account-deletion milestone, its email-code proof needs the **Magic Link** template to include `{{ .Token }}`. That flow calls `signInWithOtp` with `shouldCreateUser:false` and verifies the typed code. A template containing only a clickable magic link cannot satisfy that screen. See [email OTP templates](https://supabase.com/docs/guides/auth/auth-email-passwordless).

The June 2026 [template-customization change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) restricts new Free projects using default SMTP; custom SMTP permits customization. The current plan and template settings were not inferred from this public check.

## Real-device acceptance still required

Start each flow from the installed Resbite app and open its email on the same iPhone, returning to that same app installation. PKCE stores the verifier locally; another device or a fresh installation cannot exchange the code. Starting another PKCE flow can replace the earlier verifier. Expired/consumed codes require a new flow. See [PKCE behavior](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

After provider setup, verify with owner-authorized accounts and messages:

- Registration → email confirmation → return to app; unapproved accounts remain blocked from Resbite data.
- Password sign-in, invalid password and unconfirmed email; sign-out and restart restoration.
- Reset email → recovery form → new password; expired/reused links and wrong-device return show recovery guidance.
- Google success, browser cancellation and provider failure; one callback delivered to both browser and Router is exchanged only once.
- Invitation opened while signed out survives sign-in/profile setup. Real claim/RSVP acceptance awaits approved roster entries later.

Until those checks pass, local fixtures and exports show client behavior only. Tester access, deletion activation, push dispatch, catalogue publication and HTTPS link activation remain separate readiness decisions.

## Hosted setup update — 18 September 2026

Owner supplied a Resend sending-only credential, selected `Resbite <noreply@resbite.com>` and confirmed the domain is verified in Resend. The credential cannot list domains; domain status is owner-confirmed, not independently API-verified. No secret is stored in this repository.

Saved and verified in the Supabase dashboard:
- Site URL: `resbite://auth/callback` (installed-app fallback, replacing localhost).
- Allowed redirects: `resbite://auth/callback` and `resbite://auth/callback?recovery=1`.

SMTP saved by the owner and verified in the dashboard: custom SMTP enabled, sender name Resbite, host `smtp.resend.com`, port 465, minimum per-user interval 60 seconds, and Save changes disabled (no unsaved changes). The chosen sender is `noreply@resbite.com` and username `resend`; these sensitive input values were not exposed in the browser snapshot. The credential was not revealed or retained in repository files. End-to-end email delivery and confirmation on iPhone remain untested. Tester access is unchanged.
