# Phone key, plan 2 of 2: the app and the web page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app and the invitation page recognise a person by the phone key, text the number in its dialable form, put a country chooser before every number field, let a host say which country their unprefixed contacts are in, and ask for the person's name as the name on the list.

**Architecture:** `mobile/src/domain/phone.ts` gains the key rule and the send form, used by every screen that reads, sends or compares a number; contacts are deduplicated by key and carry their send form. A `CountrySheet` and a country button inside `PhoneField` give the app its chooser; the picker gets the same button on its typed number and an assumption line. The web page's pure flow module gets the same two functions and parses typed numbers through the phone library's browser bundle (handed in as a dependency), the page gets a `<select>` of countries built from a generated list, and the server-side renderer adds the calling code to the invitation note and loads the bundle.

**Tech Stack:** Expo SDK 57 / React Native (read https://docs.expo.dev/versions/v57.0.0/ before writing app code), TypeScript, `libphonenumber-js` 1.13.15 (already installed; the `min` metadata), node:test under tsx, Playwright headless Chrome for the two verification scripts, plain-JavaScript ES modules for the page.

**Spec:** `docs/superpowers/specs/2026-10-29-phone-key-design.md` (sections "The phone key", "The number to text", "The country dropdown", "In the app", "The host's side", "The web page", "Copy").

## Global Constraints

- Branch `pk2-clients` from `main` once plan 1 (`pk1-server`) has merged, or from `pk1-server`'s head if it has not: the app and page follow plan 1's server contract (`contacts_on_resbite` and `invite_contacts` return keys).
- **The key:** digits only; `549` followed by exactly ten digits becomes `54` followed by those ten; everything else is the digits as they are; empty input gives `""`. **The send form** of a key: `+549` + the ten digits when the key is `54` + ten digits, else `+` + the key. Both exist twice, in `mobile/src/domain/phone.ts` and `links/assets/personal-flow.mjs`, with the same test rows.
- Parsing typed numbers stays `parsePhoneNumberFromString(input, region)` with `isPossible()`, never `isValid()` (the UK fiction range used in testing is possible, not valid). No mobile-only check.
- Copy, verbatim from the spec: dropdown entry `Argentina +54`; dropdown label `Country`; search field `Search countries`; picker line `Numbers without a country code are read as {country}.` with the action `Change`; invitation note `This invitation is for a +{code} number ending ••{ending}.`; name field `Your name`; name helper `This is how {host} and the other guests will see you.`; invalid number `Enter a valid mobile number.` (unchanged). No flags. English country names only.
- No new dependencies. Never create `mobile/.env.local`; no secrets in code or tests.
- Tests run from `mobile/`: `node --import tsx <file>` for one file, `npm test` for the chain (which includes the links tests), `npm run typecheck`. Links tests: `node --import tsx ../links/personal-flow.test.mjs`, `node --test ../links/personal.test.mjs`, `node --import tsx ../links/generate.test.mjs`; the page in headless Chrome: `node --import tsx ../links/verify-personal.mjs`. The app in headless Chrome: start Metro web (`cd mobile && npx expo start --web --port 8081` in the background, note its PID, stop it by that PID when done, never a broad kill) then `node scripts/verify-phone.mjs` and `node scripts/verify-contact-invites.mjs` with `RESBITE_QA_URL=http://localhost:8081`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A "+" typed under the wrong country.** With Argentina chosen, "+1 305 555 0123" must become `+13055550123` and the chooser must switch to United States, on the page and in the app. Pinned in Task 5 (flow) and Task 6 (page); Task 2 (app hook).
2. **The stored code for a re-keyed contact.** A host's phone keeps invite codes by send form; the invited list must find them again after the server returns keys (`+5491112341234` both ways). Pinned in Task 3.
3. **Two contacts, one person.** "+54 11 1234 1234" and "+54 9 11 1234 1234" in the address book are one entry, with the 9 form shown. Pinned in Task 3.
4. **An open link on a non-UK browser.** A visitor whose browser says `es-AR` gets Argentina preselected; one whose region is unknown (`en`) gets United Kingdom. Pinned in Task 6.
5. **The assumption line re-reads contacts.** Changing the assumed country must re-parse the loaded contacts, not only new ones. Pinned in Task 4.

---

### Task 1: The rule in the app's domain, and the country list

**Files:**
- Modify: `mobile/src/domain/phone.ts`
- Modify: `mobile/src/domain/phone.test.ts`
- Create: `mobile/scripts/generate-countries.mjs`
- Create: `mobile/src/domain/countries.json` (generated; committed)
- Create: `mobile/src/domain/countries.ts`
- Create: `mobile/src/domain/countries.test.ts`
- Modify: `mobile/src/services/phoneFold.test.ts` (one test: `foldLanded` recognises the number by key)
- Modify: `mobile/package.json` (add `src/domain/countries.test.ts` to the `test` chain, after `phone.test.ts`)

**Interfaces:**
- Produces, in `phone.ts`: `phoneKey(input: string | null | undefined): string`; `phoneSendForm(input: string): string` (takes a key or any number, returns the E.164 send form); `samePhone(a, b)` now compares keys; `formatPhone(e164)` now formats `phoneSendForm(e164)` (so `"+541112341234"` reads `"+54 9 11 1234 1234"`); `regionForCallingCode(code: string): string | null` (the code's main country: `"1"` → `"US"`, `"44"` → `"GB"`, `"54"` → `"AR"`); `regionOf(e164: string): string | null` (the number's country, else its code's main country). `parsePhone`, `deviceRegion`, `phoneEnding`, `phoneVerified` unchanged.
- Produces, in `countries.ts`: `type Country = { region: string; name: string; code: string }`; `COUNTRIES: readonly Country[]` (from the JSON, sorted by name); `countryByRegion(region: string): Country | undefined`; `countryLabel(c: Country): string` (`"Argentina +54"`); `searchCountries(query: string): Country[]` (name or code contains the query, case-insensitive, trimmed; empty query gives all).

- [ ] **Step 1: Write the failing tests**

In `phone.test.ts`:

```ts
test("the phone key folds the Argentine mobile 9 and nothing else", () => {
  const rows: [string | null, string][] = [
    ["+5491112341234", "541112341234"], ["+541112341234", "541112341234"], ["5491112341234", "541112341234"],
    ["+54 9 11 1234 1234", "541112341234"], ["+5493511234567", "543511234567"], ["+13055550123", "13055550123"],
    ["+447700900834", "447700900834"], ["549123456789", "549123456789"], [null, ""], ["abc", ""],
  ];
  for (const [input, key] of rows) assert.equal(phoneKey(input), key, String(input));
});
test("the send form puts the 9 back", () => {
  assert.equal(phoneSendForm("541112341234"), "+5491112341234");
  assert.equal(phoneSendForm("+541112341234"), "+5491112341234");
  assert.equal(phoneSendForm("+5491112341234"), "+5491112341234");
  assert.equal(phoneSendForm("+447700900834"), "+447700900834");
  assert.equal(phoneSendForm("13055550123"), "+13055550123");
});
test("samePhone and formatPhone go through the key and the send form", () => {
  assert.equal(samePhone("541112341234", "+5491112341234"), true);
  assert.equal(samePhone("5491112341234", "+54 11 1234 1234"), true);
  assert.equal(samePhone("447700900834", "+447700900835"), false);
  assert.equal(formatPhone("+541112341234"), "+54 9 11 1234 1234");
  assert.equal(formatPhone("541112341234"), "+54 9 11 1234 1234");
});
test("a calling code maps to its main country, a number to its own", () => {
  assert.equal(regionForCallingCode("1"), "US");
  assert.equal(regionForCallingCode("44"), "GB");
  assert.equal(regionForCallingCode("54"), "AR");
  assert.equal(regionForCallingCode("999"), null);
  assert.equal(regionOf("+13055550123"), "US");
  assert.equal(regionOf("+447700900834"), "GB"); // fiction range: no country, so the code's main one
});
```

In `phoneFold.test.ts`:

```ts
test("foldLanded recognises the number by key", () => {
  assert.equal(foldLanded({ phone: "541112341234", phone_confirmed_at: "2026-10-01T00:00:00Z" } as never, "+5491112341234"), true);
});
```

`countries.test.ts`: `COUNTRIES` has at least 240 entries, is sorted by `name` with `localeCompare`, has no repeated `region`; `countryByRegion("AR")` deep-equals `{ region: "AR", name: "Argentina", code: "54" }`; `countryLabel` of it is `"Argentina +54"`; `searchCountries("arg")` starts with Argentina; `searchCountries("+54")` and `searchCountries("54")` include Argentina; `searchCountries("")` is the whole list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx src/domain/phone.test.ts; node --import tsx src/domain/countries.test.ts; node --import tsx src/services/phoneFold.test.ts`
Expected: FAIL (`phoneKey is not a function`; `countries.ts` missing; `foldLanded` false).

- [ ] **Step 3: Implement**

`generate-countries.mjs` (run once, output committed; header says how to regenerate): `getCountries()` from `libphonenumber-js/min`, names from `new Intl.DisplayNames(["en"], { type: "region" })`, codes from `getCountryCallingCode`, sorted by name, written as pretty JSON to `src/domain/countries.json`. `countries.ts` imports the JSON (if `tsc` rejects it, add `"resolveJsonModule": true` to `mobile/tsconfig.json`'s `compilerOptions`). In `phone.ts`, `hostRegion`'s "main country of a code" logic moves into `regionForCallingCode`; `contactInvites.ts`'s `hostRegion` then calls `regionOf` (Task 3 touches that file; here only add the two functions and leave `hostRegion` as is).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && node --import tsx src/domain/phone.test.ts && node --import tsx src/domain/countries.test.ts && node --import tsx src/services/phoneFold.test.ts && npm run typecheck`
Expected: all pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/phone.ts mobile/src/domain/phone.test.ts mobile/scripts/generate-countries.mjs mobile/src/domain/countries.json mobile/src/domain/countries.ts mobile/src/domain/countries.test.ts mobile/src/services/phoneFold.test.ts mobile/package.json
git commit -m "Phone key: the key, the send form and the country list in the app"
```

---

### Task 2: The country chooser on the app's number screens

**Files:**
- Create: `mobile/src/design/CountrySheet.tsx`
- Modify: `mobile/src/design/PhoneField.tsx`
- Modify: `mobile/src/domain/phoneCopy.ts` (add `country: "Country"`, `searchCountries: "Search countries"`, `countryButton: (name: string, code: string) => \`Country: ${name}, +${code}\``)
- Modify: `mobile/src/state/usePhoneVerification.ts:4,135-141` (and `setInput`)
- Modify: `mobile/app/auth/phone.tsx:89-95`, `mobile/app/add-phone.tsx:59-65`
- Modify: `mobile/scripts/verify-phone.mjs`

**Interfaces:**
- Consumes: Task 1's `COUNTRIES`, `countryByRegion`, `countryLabel`, `searchCountries`, `phoneSendForm`, `parsePhone`, `regionOf`.
- Produces: `CountrySheet({ visible, region, onPick, onClose }: { visible: boolean; region: string; onPick: (region: string) => void; onClose: () => void })`, an `InfoSheet` titled `PHONE_COPY.country` with a `Field` labelled `PHONE_COPY.searchCountries` and one `Pressable` row per `searchCountries(query)` result (accessibilityRole `"button"`, label `countryLabel(c)`, the chosen one marked with the kit's `Check` icon and `accessibilityState={{ selected: true }}`); picking calls `onPick(region)` then `onClose()`. `PhoneField.tsx` also exports `CountryButton({ region, onPress }: { region: string; onPress: () => void })`: a `Pressable` (accessibilityRole `"button"`, accessibilityLabel `PHONE_COPY.countryButton(name, code)`) showing `+{code}` and a `ChevronDown`. `PhoneField` gains required props `region: string` and `onRegionChange: (region: string) => void`, and renders a horizontal row: the `CountryButton` (opening `CountrySheet`), then the existing `FieldCard` with `flex: 1`. `usePhoneVerification` returns `region: string` and `setRegion(region: string): void`; `send()` parses with `region` and sends `phoneSendForm(parsed.e164)`; `setInput(value)` also calls `setRegion(regionOf(value))` when `value.trim()` starts with `"+"` and `regionOf` knows it.

- [ ] **Step 1: Write the failing test**

The hook has no unit test; the headless script is the test. In `mobile/scripts/verify-phone.mjs` add, inside the sign-up section after the existing number step: open the chooser by `page.getByRole("button", { name: /^Country:/ })`, search `Argentina`, pick `Argentina +54`, assert the button's name is `Country: Argentina, +54`, fill the number field with `11 1234 1234`, send, and assert the fixture's `/auth/v1/otp` request body has `phone: "+5491112341234"`. Then type `+44 7700 900834` into the number field and assert the button reads `Country: United Kingdom, +44` without opening the sheet. (Extend the fixture's accepted numbers so the sent code is answered.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && npx expo start --web --port 8081` in the background (note the PID), then `RESBITE_QA_URL=http://localhost:8081 node scripts/verify-phone.mjs`
Expected: the script fails at the `Country:` button (not found).

- [ ] **Step 3: Implement**

`CountrySheet` on `InfoSheet` (`mobile/src/design/kit.tsx:710`); rows in the kit's `RowGroup` style, 44 pt tall, name on the left and `+{code}` muted on the right. `PhoneField` keeps every `TextInputProps` it had. In `usePhoneVerification`, `region` starts at `deviceRegion()`; the hook's `e164` becomes the send form (so `codeBody(formatPhone(phone.e164))` reads "+54 9 11 1234 1234"); `sendFold`/`retryFold` use the same `e164`. Both screens pass `region={phone.region} onRegionChange={phone.setRegion}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && npm run typecheck && RESBITE_QA_URL=http://localhost:8081 node scripts/verify-phone.mjs`
Expected: all pass. Stop Metro by its PID.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/design/CountrySheet.tsx mobile/src/design/PhoneField.tsx mobile/src/domain/phoneCopy.ts mobile/src/state/usePhoneVerification.ts mobile/app/auth/phone.tsx mobile/app/add-phone.tsx mobile/scripts/verify-phone.mjs
git commit -m "Phone key: the country chooser on sign-up, sign-in and Add your number"
```

---

### Task 3: Contacts by key, invitations by send form

**Files:**
- Modify: `mobile/src/domain/contactInvites.ts:4-57,58-68`
- Modify: `mobile/src/domain/contactInvites.test.ts`
- Modify: `mobile/src/state/useContactInvites.ts:37,112,183-191,196-205,213-240`
- Modify: `mobile/src/state/useEvent.ts:241-253`
- Modify: `mobile/src/services/contactInvites.test.ts` (if it asserts `onResbite` or `invite` shapes, the values are keys now)

**Interfaces:**
- Consumes: Task 1.
- Produces: `ContactNumber.key` is the phone key; `ContactNumber.e164` is the send form; `contactNumbers(rows, region)` deduplicates by key (first contact wins) and labels with `formatPhone(e164)`; `hostRegion(userPhone, fallback)` uses `regionOf`. `useContactInvites` gains `assumedRegion: string` (initial `hostRegion(userPhone, deviceRegion())`) and `setAssumedRegion(region: string): void` (sets it and reloads contacts from offset 0 when contacts were loaded); `addNumber(name: string, input: string, region?: string)` parses with `region ?? assumedRegion`; `onResbite` is a `Set` of keys and the badge test is `onResbite.has(n.key)`; `invite()` matches results by `phoneKey(r.phone) === n.key`. `readInvited` (useEvent) sets `e164 = phoneSendForm(r.phone)` and looks the stored code up by that.

- [ ] **Step 1: Write the failing tests**

In `contactInvites.test.ts`:

```ts
test("two spellings of one Argentine mobile are one contact, shown with the 9", () => {
  const { numbers, skipped } = contactNumbers(
    [{ fullName: "Juan", phones: [{ number: "+54 11 1234 1234" }] }, { fullName: "Juan C", phones: [{ number: "+54 9 11 1234 1234" }] },
     { fullName: "Local", phones: [{ number: "011 15 1234 1234" }] }],
    "AR",
  );
  assert.equal(skipped, 0);
  assert.equal(numbers.length, 1);
  assert.equal(numbers[0].key, "541112341234");
  assert.equal(numbers[0].e164, "+5491112341234");
  assert.equal(numbers[0].label, "+54 9 11 1234 1234");
  assert.equal(numbers[0].country, "54");
  assert.equal(numbers[0].name, "Juan");
});
test("a contact without a code takes the host's region; one with + keeps its own", () => {
  const { numbers } = contactNumbers([{ fullName: "Kate", phones: [{ number: "305 555 0123" }, { number: "+1 305 555 0124" }] }], "AR");
  assert.deepEqual(numbers.map((n) => n.e164), ["+543055550123", "+13055550124"]);
});
test("hostRegion reads an Argentine host's number with or without the 9", () => {
  assert.equal(hostRegion("5491112341234", "GB"), "AR");
  assert.equal(hostRegion("541112341234", "GB"), "AR");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx src/domain/contactInvites.test.ts`
Expected: FAIL (`numbers.length` is 2; `key` is the E.164).

- [ ] **Step 3: Implement**

In `contactNumbers`, after `parsePhone`: `const e164 = phoneSendForm(parsed.e164); const key = phoneKey(e164);` and dedupe on `key`. In `useContactInvites`: replace the `region` memo with `assumedRegion` state seeded from the memo (re-seeded when `userPhone` changes and the host has not changed it); `setAssumedRegion` reloads with `loadContacts(0)` when `access === "ready"`; `onResbite`'s request stays `digitsOf(n.e164)` (the server keys it) and its `checked` set uses `n.key`; `invite()` builds items with `phone: digitsOf(n.e164)` and matches results by key. Keep `inviteCodeStore` keyed by `n.e164` (the send form), and in `readInvited` derive `e164` with `phoneSendForm`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && node --import tsx src/domain/contactInvites.test.ts && node --import tsx src/services/contactInvites.test.ts && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/domain/contactInvites.ts mobile/src/domain/contactInvites.test.ts mobile/src/state/useContactInvites.ts mobile/src/state/useEvent.ts mobile/src/services/contactInvites.test.ts
git commit -m "Phone key: contacts deduplicated by key, invited by send form"
```

---

### Task 4: The picker's country button and assumption line

**Files:**
- Modify: `mobile/src/design/ContactPicker.tsx:37-115`
- Modify: `mobile/src/domain/inviteCopy.ts` (add `assumed: (country: string) => \`Numbers without a country code are read as ${country}.\``, `change: "Change"`)
- Modify: `mobile/src/domain/inviteCopy.test.ts` (if it enumerates the copy)
- Modify: `mobile/scripts/verify-contact-invites.mjs`

**Interfaces:**
- Consumes: Task 2's `CountrySheet` and `CountryButton` (both exported); Task 3's `assumedRegion`, `setAssumedRegion`, `addNumber(name, input, region)`, `onResbite.has(n.key)`.

- [ ] **Step 1: Write the failing test**

In `verify-contact-invites.mjs`, in the Pick step: assert the text `Numbers without a country code are read as United Kingdom.` is visible (the fixture host's number is `+44…`); tap `Change`, search `Argentina`, pick `Argentina +54`; assert the line now reads `… read as Argentina.`; in "Add a number" the country button reads `Country: Argentina, +54`; add `11 1234 1234` with a name and assert the chip appears and the lookup request (`contacts_on_resbite`) body contains `"5491112341234"`; set the fixture to answer that lookup with `["541112341234"]` and assert the row shows the On Resbite badge.

- [ ] **Step 2: Run the test to verify it fails**

Run: Metro web in the background, then `cd mobile && RESBITE_QA_URL=http://localhost:8081 node scripts/verify-contact-invites.mjs`
Expected: FAIL at the assumption line (not found).

- [ ] **Step 3: Implement**

Under the search field: a `Copy` with `T.assumed(countryByRegion(k.assumedRegion)?.name ?? k.assumedRegion)` and a `TextAction` `T.change` that opens `CountrySheet` bound to `k.setAssumedRegion`. In the "Add a number" card: the manual number's own `region` state (initial `k.assumedRegion`), the `CountryButton` before the number `Field`, and `k.addNumber(name, number, region)`. The badge: `k.onResbite.has(chosen.key)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && npm run typecheck && RESBITE_QA_URL=http://localhost:8081 node scripts/verify-contact-invites.mjs && node --import tsx src/domain/inviteCopy.test.ts`
Expected: all pass. Stop Metro by its PID.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/design/ContactPicker.tsx mobile/src/domain/inviteCopy.ts mobile/src/domain/inviteCopy.test.ts mobile/scripts/verify-contact-invites.mjs
git commit -m "Phone key: the picker's assumed country and the typed number's country"
```

---

### Task 5: The page's flow module parses with the library and compares by key

**Files:**
- Modify: `links/assets/personal-flow.mjs:20-55,99-129,218-221,340-363`
- Modify: `links/personal-flow.test.mjs`

**Interfaces:**
- Produces: `phoneKey(input)` and `phoneSendForm(input)` (the same rules and test rows as Task 1); `regionForCallingCode(code, lib)`; `composeNumber(input, region, lib)` returns the **send form** of a possible number parsed with `lib.parsePhoneNumberFromString(input, region)`, else `null` (a `+`/`00` input is parsed as typed, whatever `region` says); `formatNumber(e164, lib)` → `lib.parsePhoneNumberFromString(e164)?.formatInternational() ?? e164`; the reducer's `send` event is `{ type: "send", input, region, lib }` and on success stores `phone` (the send form) and `number` (the formatted send form); `maskNumber` unchanged; `sameNumber(session, entry)` compares keys. `PAGE_COPY`: `nameField: "Your name"`, new `nameHelper: (host) => \`This is how ${host} and the other guests will see you.\``, new `countryLabel: "Country"`, new `countryOption: (name, code) => \`${name} +${code}\``, `outsideUk` removed. `lib` is `{ parsePhoneNumberFromString, getCountries, getCountryCallingCode }`: `libphonenumber-js/min` in tests, the browser bundle's global on the page.

- [ ] **Step 1: Write the failing tests**

In `personal-flow.test.mjs` (which runs under tsx from `mobile/`, so `import * as lib from "libphonenumber-js/min"` resolves):

```js
test("composeNumber parses with the chosen country and returns the send form", () => {
  const rows = [
    ["+54 9 11 1234 1234", "GB", "+5491112341234"], ["+54 11 1234 1234", "GB", "+5491112341234"],
    ["011 15 1234 1234", "AR", "+5491112341234"], ["11 1234 1234", "AR", "+5491112341234"],
    ["+54 9 351 123 4567", "AR", "+5493511234567"], ["(305) 555-0123", "US", "+13055550123"],
    ["+1 305 555 0123", "AR", "+13055550123"], ["07700 900834", "GB", "+447700900834"],
    ["+44 (0) 7700 900834", "AR", "+447700900834"], ["00 44 7700 900834", "AR", "+447700900834"],
    ["123", "AR", null], ["abc", "AR", null], ["", "GB", null],
  ];
  for (const [input, region, out] of rows) assert.equal(composeNumber(input, region, lib), out, `${input} (${region})`);
});
test("the key and the send form", () => { /* Task 1's rows for phoneKey; the five phoneSendForm rows */ });
test("sameNumber compares keys", () => {
  assert.equal(sameNumber({ phone: "+5491112341234" }, { phone: "+541112341234" }), true);
  assert.equal(sameNumber({ phone: "+447700900834" }, { phone: "+447700900835" }), false);
});
test("send stores the send form and its international spelling", () => {
  const s = next({ ...initialState(), step: "confirm", ticked: true }, { type: "send", input: "11 1234 1234", region: "AR", lib });
  assert.equal(s.phone, "+5491112341234");
  assert.equal(s.number, "+54 9 11 1234 1234");
  assert.equal(s.busy, true);
});
test("regionForCallingCode", () => { assert.equal(regionForCallingCode("1", lib), "US"); assert.equal(regionForCallingCode("54", lib), "AR"); assert.equal(regionForCallingCode("999", lib), null); });
test("the words", () => {
  assert.equal(PAGE_COPY.nameField, "Your name");
  assert.equal(PAGE_COPY.nameHelper("Ana"), "This is how Ana and the other guests will see you.");
  assert.equal(PAGE_COPY.countryOption("Argentina", "54"), "Argentina +54");
  assert.equal(PAGE_COPY.outsideUk, undefined);
});
```

Update the existing `composeNumber` tests to the new signature (the old `(input, country)` rows that assumed a bare calling code are replaced by the table above).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx ../links/personal-flow.test.mjs`
Expected: FAIL (`phoneKey` not exported; `composeNumber` returns the old composition).

- [ ] **Step 3: Implement**

Keep the module free of imports (it runs in the browser as is); `lib` arrives as an argument. `composeNumber`: trim; parse with `lib.parsePhoneNumberFromString(text, region)`; `isPossible()` or null; return `phoneSendForm(parsed.number)`. Update the module's header comment (no more "the invitation's country" composition).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && node --import tsx ../links/personal-flow.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add links/assets/personal-flow.mjs links/personal-flow.test.mjs
git commit -m "Phone key: the page's flow parses with the library and compares by key"
```

---

### Task 6: The page's dropdown, the name helper, the note and the site build

**Files:**
- Modify: `links/assets/personal.js:60-80,98-120,146-160,370-392` (and the import list)
- Modify: `links/assets/personal.css:68-72` (the number row and the select)
- Modify: `links/server/lib/personal.mjs:33,105-108,127,139` (the note takes the code; the bundle's script tag before the module)
- Modify: `links/generate.mjs:64` (copy the bundle; write `countries.mjs`)
- Modify: `links/generate.test.mjs`, `links/personal.test.mjs`, `links/verify-personal.mjs`

**Interfaces:**
- Consumes: Task 5's `composeNumber(input, region, lib)`, `regionForCallingCode`, `formatNumber`, the new copy; `mobile/src/domain/countries.json` (Task 1).
- Produces: the generated site carries `/libphonenumber-min.js` (copied from `mobile/node_modules/libphonenumber-js/bundle/libphonenumber-min.js`) and `/countries.mjs` (`export default [...]` from the JSON); the page's `<head>` loads `<script src="/libphonenumber-min.js"></script>` before `<script type="module" src="/personal.js">`; `personal.js` imports `COUNTRIES from "./countries.mjs"`, builds `<select id="country" aria-label="Country">` with one `<option value={region}>` per country labelled `C.countryOption(name, code)`, placed in the number field's row before the input; default: personal mode `regionForCallingCode(data.country, lib) ?? "GB"`, open mode the region of `navigator.language` when `COUNTRIES` has it, else `"GB"`; on input, a value starting with `+` whose `lib.parsePhoneNumberFromString(value)?.country` is in the list sets the select; `onSend` dispatches `{ type: "send", input: number.value, region: country.value, lib: window.libphonenumber }`; the name field has `autocomplete: "name"` and a helper `<p id="name-helper" class="helper">` with `C.nameHelper(host)`, named in the input's `aria-describedby`. `PERSONAL_WORDS.forNumber(code, ending)` → `This invitation is for a +${code} number ending ••${ending}.`

- [ ] **Step 1: Write the failing tests**

`generate.test.mjs`: the output has `libphonenumber-min.js` (non-empty) and `countries.mjs` starting with `export default [` and containing `"Argentina"`. `personal.test.mjs`: the rendered personal page contains `This invitation is for a +44 number ending ••34.` (adjust to the fixture's ending) and `<script src="/libphonenumber-min.js"></script>` before the module tag, and the open page has the script too but no note. `verify-personal.mjs`, in the whole-path test: the select (`page.getByLabel("Country")`) has `United Kingdom +44` selected; typing `+44 (0) 7700 900834` sends the check with `+447700900834`; choosing `Argentina +54` then typing `+44 7700 900834` leaves the check number `+447700900834` and switches the select back to `United Kingdom +44`; the name field is labelled `Your name` and `This is how Marcos and the other guests will see you.` is visible on the answer step; the text `Outside the UK?` never appears. In the open-link test: with the browser launched as `es-AR` (`browser.newContext({ locale: "es-AR" })`), the select shows `Argentina +54`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd mobile && node --import tsx ../links/generate.test.mjs; node --test ../links/personal.test.mjs; node --import tsx ../links/verify-personal.mjs`
Expected: FAIL (files missing; note text unchanged; no select).

- [ ] **Step 3: Implement**

`generate.mjs`: resolve the bundle relative to the script (`../mobile/node_modules/libphonenumber-js/bundle/libphonenumber-min.js`) and the JSON (`../mobile/src/domain/countries.json`); write `countries.mjs` as `export default ${JSON.stringify(list)};`. The CSP is `script-src 'self'`, so a same-origin classic script is allowed; `connect-src` allows only Supabase, which is why the list ships as a module, not a fetched JSON. `personal.css`: `.field.number { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: end; }` and `.field select { font: inherit; font-size: 18px; border: 0; background: transparent; color: var(--ink); padding: 4px 0; max-width: 12em; }`; the helper line reuses `.helper`. Remove `numberHint` and its `aria-describedby` from `personal.js`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd mobile && node --import tsx ../links/generate.test.mjs && node --test ../links/personal.test.mjs && node --import tsx ../links/personal-flow.test.mjs && node --import tsx ../links/verify-personal.mjs && npm test`
Expected: all pass, the whole chain green.

- [ ] **Step 5: Commit**

```bash
git add links/assets/personal.js links/assets/personal.css links/server/lib/personal.mjs links/generate.mjs links/generate.test.mjs links/personal.test.mjs links/verify-personal.mjs
git commit -m "Phone key: the page's country dropdown, name helper and the library bundle"
```

---

### Task 7: The records

**Files:**
- Modify: `qa/phone-key-2026-10-29/README.md` (plan 1's runbook: a "Plan 2" section)
- Modify: `docs/implementation-status.md` (the phone-key entry's app and page lines)

- [ ] **Step 1: Write the runbook's plan 2 section**

What the app and the page now do (the chooser and its defaults, the assumption line, the name helper, the note), the owner's steps in order after the migration: generate and deploy the link site (`links/generate.mjs https://link.resbite.com QY833VTUWL com.resbite.app <dir>`, `npx vercel link --yes --project resbite-link --scope creamos` with its `.env.local` deleted, a preview checked for `/libphonenumber-min.js` and `/countries.mjs` served as JavaScript, then `npx vercel deploy --prod --yes --scope creamos`), then the TestFlight build; and the iPhone checks (an Argentine number typed three ways on the page and in the app; a US number with Argentina chosen; a contact saved without a code). Note the current build's loss (the On Resbite badge for Argentine contacts saved with the 9) until the new build.

- [ ] **Step 2: Run the whole chain once more**

Run: `cd mobile && npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add qa/phone-key-2026-10-29/README.md docs/implementation-status.md
git commit -m "Phone key: the app and page rollout steps"
```
