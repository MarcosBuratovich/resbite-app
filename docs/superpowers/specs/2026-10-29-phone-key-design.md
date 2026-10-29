# Phone numbers: one key, a country dropdown, and the name on the list

**Date:** 29 October 2026. **Status:** approved by the owner on 29 October 2026 after the builder check (PK-D4).
**Builds on:** `main` at `526e1ae` (UX1–UX4, GI1, GI2, the four contact-invitation plans; their migrations `20261027120000` … `20261030120000` are live on the hosted project). Independent of the unmerged `cr1-database` branch; see Rollout for the order.
**Code this changes:** `mobile/src/domain/phone.ts`, `contactInvites.ts`, `PhoneField.tsx`, `ContactPicker.tsx`, `usePhoneVerification.ts`, `useContactInvites.ts`, `phoneFold.ts`; `links/assets/personal.js`, `personal-flow.mjs`, `links/generate.mjs`; the phone functions of `supabase/migrations/20261027120000_phone_accounts.sql` and `20261028120000_contact_invitations.sql`; `supabase/functions/_shared/phone-fold.ts`.

## Intent

The owner tested the last TestFlight build and found that a person invited by phone number is only recognised when they type the number exactly as the host had it. An Argentine mobile has three honest spellings: **+54 9 11 1234 1234** (what phones and WhatsApp show), **+54 11 1234 1234** (what many people have saved) and **011 15 1234 1234** (how it is dialled at home). The host's contact may hold any of them and the invitee types whichever comes to mind, so today the web page says "That isn't the number Ana invited" to the right person. The same build sends the text-message code to whatever was typed, and in Argentina a code sent to the form without the 9 never arrives. The web page also assumes the UK for a number typed without "+", asks for a "first name" that is really the name the host will see, and the app's own number screens have the same Argentine problem.

The fix is one rule for "which digits identify the same phone", used everywhere a number is stored or compared, plus a country chooser before every number field, and a name step that says what the name is for. The rule is global (every country goes through the same library), with Argentina's mobile prefix as the one country-specific equivalence known today; adding another later is one line in three places.

**Success**
- Marcos, in Buenos Aires, has Juan saved as "11 1234 1234" and invites him. Juan opens the link on his phone: the page shows **Argentina +54** already chosen. He types "11 1234 1234", "+54 9 11 1234 1234" or "011 15 1234 1234"; each is accepted, the code arrives on his mobile, and he answers.
- Marcos has Kate saved as "+1 305 555 0123". Kate, living in Buenos Aires with her US number, opens the link: the page shows **United States +1**. She types "305 555 0123" and it matches. Later she installs Resbite, picks United States in the app's sign-up and types the same number; the code arrives and her answer is already there.
- Marcos has Kate saved as "305 555 0123" with no "+". The app read it as an Argentine number, so Kate's page says the invitation is for a +54 number ending ••23. She tells Marcos, who invites her again from the picker, typing her number with the country set to United States.
- On the answer step the field says **Your name**, and under it: "This is how Marcos and the other guests will see you."

## Owner decisions (29 October 2026)

| # | Decision |
|---|---|
| PK-D1 | The same country dropdown and the same matching rule go into the app's number screens, not only the web page. |
| PK-D2 | The rule is global, not an Argentina special case. A person abroad, and a person with a foreign number living in Argentina, must both be recognised. |
| PK-D3 | The web answer step asks for the person's name and says it is the name shown on the list. |
| PK-D4 | Existing Argentine accounts whose verified number lacks the 9 are rewritten to the send form, with a rollback: by an owner-run script at the release of the build that sends the 9 form, re-runnable for accounts made in between, not by the migration (see "Older Argentine accounts"). |

## The phone key

The **phone key** of a number is the digits of its international form, with these equivalences applied:

- Argentina (+54): a mobile's "9" after the country code is dropped. `549` followed by exactly ten digits becomes `54` followed by those ten digits. Argentine area codes never start with 9, so `549` always marks a mobile.
- Everything else: the international digits as they are. The phone library already folds national prefixes, the Argentine "15", "00" and the "(0)" after a country code into the international form before the key is taken.

| Typed (country chosen) | International form | Key |
|---|---|---|
| +54 9 11 1234 1234 (any) | +5491112341234 | 541112341234 |
| +54 11 1234 1234 (any) | +541112341234 | 541112341234 |
| 011 15 1234 1234 (Argentina) | +5491112341234 | 541112341234 |
| 11 1234 1234 (Argentina) | +541112341234 | 541112341234 |
| +54 9 351 123 4567 (any) | +5493511234567 | 543511234567 |
| (305) 555-0123 (United States) | +13055550123 | 13055550123 |
| +1 305 555 0123 (Argentina chosen; "+" wins) | +13055550123 | 13055550123 |
| 07700 900834 (United Kingdom) | +447700900834 | 447700900834 |
| +44 (0) 7700 900834 (any) | +447700900834 | 447700900834 |
| 00 44 7700 900834 (any) | +447700900834 | 447700900834 |
| 123 (any), "abc" (any) | refused: "Enter a valid mobile number." | — |

The key is what `private.phone_invitations.phone` and `private.test_codes.phone` store, what every comparison in the database uses, and what the app and the web page compare locally. The rule exists in three places that must agree: SQL `private.phone_key(text)`, TypeScript `phoneKey()` in `mobile/src/domain/phone.ts` (used by the app and, as plain JavaScript, by `links/assets/personal-flow.mjs`), and the fold function's shared code in Deno. Only the app and the page parse what a person types (the first two columns of the table, through the phone library with the chosen country); the database and the fold function receive international digits and take the key (the last two columns). The tests follow that split: every row's "typed → international form" is a client test, every row's "international form → key" is a test in all three places, and the refused rows are client tests.

### The number to text

Every number entered in Resbite is a mobile, because Resbite texts it. The **send form** of a key is its international form with the Argentine 9 put back: `54` followed by ten digits becomes `+549` followed by them; any other key becomes `+` and the key. No mobile-only check is made: the library's small metadata cannot tell a mobile from a landline in most countries, and the existing code chose "possible" over "valid" on purpose (the UK fiction range used in testing is possible but not valid). An Argentine landline typed here gets a 9 and a code that never arrives; the person sees no code and changes the number. The send form is what goes to Supabase Auth for the code, what the account's phone holds after verification, what the host's WhatsApp and Messages share links address, and what the app and page show when they format a number ("+54 9 11 1234 1234"). The library's formatter takes the send form.

### Looking up accounts

`auth.users.phone` holds the digits the person verified, which for an older Argentine account may lack the 9. A lookup there compares the key's **variants**: `private.phone_variants(key)` returns the key and, for a `54` + ten-digit key, the `549` form too. Lookups use `phone = any(variants)` so the existing index on the column still serves. Comparisons against one known account use `private.phone_key(u.phone) = key`. What a lookup hands back to the app is what the app sent (its digits, and for `contacts_on_resbite` its key too), never an account's own digits, so the current build, which matches by the digits it sent, and the new one, which matches by key, both find their numbers. Of two accounts holding both spellings of one number, `invite_contacts` takes the caller first, then the 9 form.

## The country dropdown

A country chooser sits before every number field, on the web and in the app.

- **The list** is every country the phone library knows, shown as "Argentina +54" and sorted by name. Names are English, from one list generated once at build time (Node's `Intl.DisplayNames`) and shipped to the app and the page; the page does not depend on the visitor's browser having the API. No flags: Windows shows them as letters.
- **The default** is the best guess, and the person can change it:
  - personal invitation page: the invited number's country (the calling code stored with the invitation, mapped to that code's main country: +1 United States, +44 United Kingdom);
  - open link page: the visitor's browser region when it is one the list knows, else United Kingdom (today's `OPEN_LINK_COUNTRY`);
  - app sign-up, sign-in and Add your number: the device's region (today's `deviceRegion()`);
  - the contact picker's typed number: the host's region (today's `hostRegion()`).
- **A number typed with "+"** (or "00") is taken as typed, whatever the dropdown says, and the dropdown switches to that number's country so the two never disagree on screen.
- **Parsing** goes through the phone library with the chosen country, as the app already does: the number must be "possible" there, or the field says "Enter a valid mobile number." The web page stops using its own composing rule and gets the library's browser bundle (`libphonenumber-min.js`, 179 KB, 43 KB compressed), copied by `generate.mjs` next to the other assets and handed to the flow module as a dependency so the flow's tests keep running in Node.
- The web page's line "Outside the UK? Start with + and your country code." goes; the dropdown replaces it.

### In the app

`PhoneField` gains the country chooser: a button at the start of the field showing the calling code ("+54"), with the country name as its accessibility label; tapping it opens a sheet with a search field and the list, in the app's kit. The chosen country lasts for that screen. It appears on sign-up and sign-in (`mobile/app/auth/phone.tsx`), Add your number (`mobile/app/add-phone.tsx`) and the picker's typed number (`ContactPicker.tsx`, PK-D1).

## The host's side

- **Contacts saved with "+" or "00"** carry their country and keep working, wherever the host is (PK-D2).
- **Contacts saved without a country code** are read as numbers of the host's region, as WhatsApp does. The picker shows each number formatted internationally, so a wrong guess is visible. Because a host living abroad, or with a foreign number, may have mostly local contacts, the picker says which country it assumed and lets the host change it: a line under the search field, "Numbers without a country code are read as Argentina. Change", where Change opens the same country sheet and re-reads the contacts. This is the owner's "US number in Argentina" case from the host's side; the invitee's side is the dropdown.
- **On Resbite** badges match by key: `contacts_on_resbite` returns, for each sent number that belongs to someone On Resbite, both its digits as sent and its key, distinct and sorted (only what the caller sent and its key, never the accounts' raw digits); the new app compares keys, and the current build's comparison by digits keeps working.
- **Invited list** (`plan_phone_invitations`) carries keys; the app formats them through the send form, so an Argentine entry reads "+54 9 11 1234 1234". The results of `invite_contacts` carry each number's digits as the app sent them (the current build matches each result to its item by those digits), while the invitation is stored and compared by key.
- **Share links** (WhatsApp, Messages) address the send form.

## The web page

- The number step: country dropdown, then the number field, as above. The invitation page's note becomes "This invitation is for a +54 number ending ••34." (the calling code is added so a person with a foreign number sees why it will not match). The wrong-number error stays "That isn't the number Ana invited." and the existing "Not your number? Ask Ana to invite you again." line stays under it.
- The code goes to the send form. "We sent a 6-digit code to +54 9 11 1234 1234." formats the send form.
- The answer step (PK-D3): the field label is **Your name** (autocomplete "name", not "given-name"), with a helper line under it: **"This is how Ana and the other guests will see you."** The 1–80 character rule and its message stay.
- The kept-session check (`sameNumber`) and the open link's "✓ Verified · ••34" compare and show keys.

## The database

One migration, `supabase/migrations/20261030130000_phone_key.sql`, with its rollback, hosted-baseline rehearsal pair and SQL tests, in the pattern of the contact-invitation migrations:

- `private.phone_key(text)` and `private.phone_variants(text)`, immutable, revoked from the API roles. `private.phone_digits` stays for the hook's shape check.
- Redefined to use the key: `public.send_sms_hook` (stores the key of the number Auth texts), `public.exchange_test_code` (looks up by key; account lookups by variants), `private.contacts_on_resbite` (by variants; returns the sent numbers' digits as sent and their keys), `private.invite_contacts` (keys in, holder lookup by variants with the caller first and then the 9 form, the host's own number by `phone_key`; returns the digits as sent), `private.revoke_phone_invitation`, `private.check_invited_number`, `private.answer_phone_invitation` (`phone_key(u.phone) = v_inv.phone`). `plan_phone_invitations`, `personal_invitation_page` and `my_phone_invitation` read stored keys and need no change; the builder confirms by grep that no other comparison of `phone` remains.
- Existing rows are re-keyed: `phone_invitations.phone` becomes its key; where two rows of one plan collapse to one key, a live row (not revoked) wins; among live rows the one that was answered (has `user_id`); else the newest; and the others go. `test_codes` rows are deleted (they live ten minutes).
- **Older Argentine accounts (PK-D4).** Supabase Auth matches `auth.users.phone` exactly, outside any function of ours. Today's app sends an Argentine number typed as "11 1234 1234" without the 9, so accounts made that way hold `5411…`. Once every client sends the send form, such an account signing in with its own number would get "no account" (the app) or a second, empty account (the web page, which creates users). Until then the reverse holds: the current build signs such an account in with the digits it was made with, so a rewrite before the new build is out would lock those testers out of the old build. The verified phone of every Argentine account that lacks the 9 is therefore rewritten to the send form (`phone`, and a pending `phone_change`, in `auth.users`, plus the matching `auth.identities` row if the phone provider keeps one; the builder checks the hosted GoTrue version's shape in the local stack first) not by the migration but by an owner-run script, `supabase/ops/rewrite-older-argentine-accounts.sql`, run at the release, in the same sitting as the TestFlight build that sends the 9 form. The script is idempotent and re-runnable: a second run changes nothing, and a later run covers older accounts made by the old build in between. Testers who signed up on the old build typing the local form use the new build once the script has run (the old build would say "no account") and never sign up again. Where another account already holds the 9 form, nothing is rewritten and the pair is counted in the after-snapshot for the owner, who decides by hand (expected: none; the project is in test mode with a handful of tester accounts). The migration creates the script's record, `private.phone_rewrites(user_id, old_phone, new_phone, rewritten_at)`, empty, with `user_id` referencing `auth.users(id) on delete cascade`; the script fills it, the rollback puts the recorded numbers back from it (stopping first, with the count only, if another account now holds one of them) and drops it. Otherwise it stays until a later migration drops it, written when the rollback window is declared closed (never a drop by hand, which would leave hosted unlike a replay of its migrations); the rollback is meaningful only while it exists.
- The current TestFlight build keeps working against the new functions: it sends international digits, which the server keys, and gets back the digits it sent, so it keeps personal links and the On Resbite badge. Its only loss, until the new build, covers every 9-form invitation (saved with the 9 or dialled as 011 15 …), because each is stored by key: the ones the migration re-keyed and the new ones the old build sends after the migration. For those, the invited list shows the number instead of the saved name, and "send again" mints a new code.

## The fold function

`fold-phone-account` compares the foreign (web) account's phone to the number the app sent by key, and sets the app account's phone to the foreign account's verified digits (the number that actually received the code), not to what the app typed. Its shared code gets the key rule with the same table as its test. Redeploy after the migration.

## Copy

| Where | Text |
|---|---|
| Dropdown entry | `Argentina +54` |
| Dropdown label (app and web) | `Country` |
| Picker assumption line | `Numbers without a country code are read as {country}. Change` |
| Country sheet search field | `Search countries` |
| Invitation note | `This invitation is for a +{code} number ending ••{ending}.` |
| Name field | `Your name` |
| Name helper | `This is how {host} and the other guests will see you.` |
| Invalid number | `Enter a valid mobile number.` (unchanged) |

## Non-goals

- Localised country names or flags.
- Changing the app's About you step (it already says "Your name"; the list helper is a web-page fix).
- Setting up the SMS provider on the hosted project (`phone_mode.test_mode` is still true); this spec makes the number right for when it is on.
- Guessing a contact's country beyond the host's region and the picker's assumption line.
- Other countries' equivalences. Mexico dropped its mobile "1" in 2019 and the library refuses the old form ("+52 1 55 1234 5678" is not a possible number), so a contact saved that way is counted as skipped; nothing special is built for it.

## Rollout (each step needs the owner's approval)

1. The migration, approved by file name and sha256, applied with `supabase db query --linked -f` and `migration repair --status applied`, with before/after snapshots as the earlier runbooks; any time after approval (the current build keeps working against it).
2. `fold-phone-account` redeploy.
3. In one sitting: the link site deploy (Vercel `resbite-link`), then the TestFlight build, then the owner-run `supabase/ops/rewrite-older-argentine-accounts.sql` (approved by sha256 with the migration).
4. The counts again, after every run of the script.

The migration's version `20261030130000` sits before the unmerged `20261031120000_creating_a_resbite.sql`. That branch redefines `invite_contacts`; when it is rebased on `main`, its body must start from this migration's version of the function, and its hosted rehearsal then replays with this migration applied first.

## Left to the builder

- The exact shape of the app's country sheet within the kit, and how the chosen country is kept while a screen is open.
- How the flow module receives the library on the page and in Node tests.
- The generated country-name list's location and its build step.
- The SQL for collapsing duplicate invitation rows.
