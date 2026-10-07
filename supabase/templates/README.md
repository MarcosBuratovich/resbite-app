# Resbite Auth emails

Confirmation template authored 23 September 2026. Subject: `Confirm your email — a little time together starts here`.

`confirmation.html` uses the existing brand palette, table layout, inline styling, system-font fallbacks and no remote images, fonts or tracking. The text wordmark remains visible with images disabled. Supabase `{{ .ConfirmationURL }}` is used unchanged for the button and fallback link. No credentials or example live confirmation tokens belong here.

Previous hosted subject: `Confirm your email address`. Previous body is retained in `confirmation.previous.html` for rollback.

Apply to Authentication → Emails → Confirm sign up in the existing Resbite project. This changes content only; it does not send an email, bypass confirmation or open tester access. Browser render checks do not replace real Apple Mail/Gmail/Outlook delivery checks. Password recovery and OTP templates remain separate work.

Deployed to the existing hosted Confirm sign up template on 23 September 2026. Supabase confirmed the save, and its rendered preview showed the branded content only, with the unchanged confirmation URL placeholders. Local browser previews passed at 320 and 600 px without horizontal overflow. No live email was sent. Inbox rendering and the real confirmation loop remain unverified.

## Prepared follow-up templates — 23 September 2026

- `recovery.html` / `recovery.subject.txt`: map to **Reset password**, preserving `{{ .ConfirmationURL }}` and same-iPhone guidance.
- `email-code.html` / `email-code.subject.txt`: map to **Magic link or OTP**, because deletion proof uses `signInWithOtp` and a typed `{{ .Token }}`. Do not accidentally map this to the separate Reauthentication template. The app has no general magic-link sign-in flow; review that assumption before changing this template in another client.

These two templates are local, not deployed. Preserve each existing hosted body/subject before applying and check its rendered preview after saving. No email or deletion is triggered by preparation. Do not enable the deletion feature merely because its email copy is ready.

Run `node mobile/scripts/verify-emails.mjs` using Node 22 after installing mobile dependencies. This verifies placeholder/link contracts and renders all three templates at 320/600 px using nonfunctional fixture URLs, with all network requests blocked. Screenshots are written to `/private/tmp/resbite-email-previews/`. These checks passed; actual inbox rendering, delivery and link/code acceptance remain pending.

## Deployment completed — 23 September 2026

Owner requested deployment of all prepared branded emails. Recovery was saved to **Reset password** with subject `Reset your Resbite password`; email-code was saved to **Magic link or OTP** with subject `Your Resbite verification code`. Hosted previews were checked before saving, and saved state verified. Their previous bodies are retained in the corresponding `.previous.html` files; previous subjects were `Reset your password` and `Your sign-in link`.

All three prepared branded templates are now deployed, superseding the earlier local-only status. Other Supabase templates and notification toggles were not changed. No email was sent, no credentials changed, and no deletion or additional tester access was enabled. Live inbox/link/code acceptance remains pending.
