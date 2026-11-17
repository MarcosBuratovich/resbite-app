# Breach response runbook

| | |
|---|---|
| **Owner** | The owner, for Resbite Ltd (the controller) |
| **Version** | 1.0 — draft for solicitor review (decision D-12), not yet in force |
| **Date** | 17 November 2026 |
| **In force from** | [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]]. Use it now for the test-mode review (section 11) |
| **Next review** | After every breach, and no later than 17 November 2027 (F15) |
| **Purpose** | What to do in the first hours of a suspected personal data breach: who decides, how to contain it, the 72-hour test, reporting to the ICO, telling people, and the log. |

This is an internal procedure (gap analysis item A17; row PRV-10). It holds no personal data: people appear only by role. A UK solicitor reviews it with the public documents before launch (decision D-12). It is written to be complete and usable as it stands.

**What it describes.** Resbite at version 1.0, after workstreams B, C and D of the gap analysis are built, using the recommended default for every owner decision D-3 to D-25. A step that is not possible yet carries **[needs X]**. Section 14 lists them.

**References.** "The gap analysis" is `docs/superpowers/specs/2026-11-17-app-store-readiness-design.md`. Companion records in this folder: `records-of-processing.md` (A8, including the security measures), `vendors.md` (A18), `team-access.md` (A24), `moderation-standard.md` (A15), `law-enforcement-requests.md` (A22).

**The regulator.** The Information Commission (ICO), ico.org.uk. It took over from the Information Commissioner's Office on 30 September 2026 and still uses the name ICO.

**The breach log is kept outside the repo** (section 10). This file holds the procedure and the log's format only.

## Placeholders to fill

1. [[OWNER: effective date — proposed: the day version 1.0 is released on the App Store]]
2. [[OWNER: ICO data protection fee registration number — proposed: pay tier 1 before launch and enter the number here]]
3. [[OWNER: tool that holds the moderation, request, complaint, breach and law-enforcement logs — proposed: one access-controlled spreadsheet in the mailbox provider's business workspace, under the same data processing agreement]]
4. [[OWNER: SMS provider — proposed: Twilio]]
5. [[OWNER: CAPTCHA vendor — proposed: Cloudflare Turnstile or hCaptcha]]
6. [[OWNER: whether the company holds cyber insurance, and the insurer's notification deadline — proposed: record "none" if none]]
7. [[OWNER: how long to keep breach log entries — proposed: six years after each breach is closed, with entries holding no names, numbers or account ids]]
8. [[OWNER: VAT number, or delete if not VAT-registered]] (in the signature of the notices, section 12)

---

## 1. What counts as a personal data breach

A breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data (UK GDPR Art 4(12)). It does not have to be an attack. Examples for Resbite:

- Someone signs in to an account that is not theirs (the phone-code test mode made this possible until it was switched off, section 11).
- A secret key leaks: the Supabase secret key, a worker secret, the Apple, Expo, Resend, SMS or CAPTCHA keys.
- A database policy or function bug lets people read what they should not: chats, phone numbers, meeting details, reports, blocks.
- An export or a reply goes to the wrong email address.
- A team member's laptop or phone with dashboard access is lost or stolen.
- A team member looks at or copies data they have no reason to see.
- A vendor tells us it has had a breach affecting our data.
- Data is deleted or corrupted and cannot be restored from backups.

## 2. Roles

| Role | Does |
|---|---|
| **Anyone who suspects a breach** (the owner, the backup moderator, anyone told by a user or vendor) | Tells the owner at once by phone or message (section 3). Does not investigate beyond their own access, does not delete anything, does not contact the attacker. |
| **The owner** | Decides. Leads containment, makes the 72-hour decision, reports to the ICO, decides whether to tell people, keeps the log. Approves every hosted step at the time (house rule), and records it afterwards in a `qa/` runbook without personal data. |
| **The backup moderator** | Reports, and contains only within their own access: for example, signs out of a lost device's sessions and changes their own passwords. If the owner cannot be reached within 24 hours of the report and the 72-hour deadline is at risk, files an initial report with the ICO with what is known, if the signed instructions in `team-access.md` give them that authority. |
| **The solicitor** | Advises on whether to report, whom to tell and how, and on any police or legal angle. |
| **Processors** (Supabase, Vercel, Expo, Resend, the SMS provider, the CAPTCHA vendor, the mailbox provider, the log tool) | Must tell us without undue delay after becoming aware of a breach of our data (Art 33(2); their DPAs, `vendors.md`) **[needs F7]**. |

## 3. The first hour

1. **Tell the owner** at once, by phone or message: what you saw, when, and how. Do not attach personal data.
2. **Start the log entry** (section 10): who reported it, when, and what is known. Write down the time the owner became aware: the 72-hour clock may run from then.
3. **Preserve evidence.** Do not delete rows, logs, emails or accounts. Platform logs are short-lived: Supabase keeps them 7 days and Vercel for hours to a day (plan UNVERIFIED). Export the relevant log lines at once into the breach folder in the log tool, access-restricted. Note the time range you exported.
4. **Contain** (section 4). Stop the harm first; understand it fully later.
5. **Book the next check-in** within a few hours, and keep updating the log as facts change.

## 4. Containment

Every hosted change needs the owner's approval at the time. Record what was done and when.

### 4.1 By scenario

| Scenario | Contain |
|---|---|
| **Account takeover, or a sign-in weakness** | Close the weak path (as the C1 switch-off closes test mode). Revoke sessions: sign every affected user out with the Auth admin API, or delete their rows in `auth.sessions` and `auth.refresh_tokens` (the method in `qa/phone-accounts-2026-10-27/README.md`, step 7.2). Access tokens already issued stay valid until they expire (one hour by default) but cannot be refreshed. Suspend an account an attacker created (`moderation-standard.md`). |
| **A leaked secret** | Rotate it (section 4.2), update every place that holds it, redeploy, then look in the logs for use while it was exposed. |
| **An admin account compromised** (Supabase, Vercel, Expo, Apple, Google Cloud, Resend, GitHub, the inboxes, the log tool) | Remove the account's access from the organisation; reset its password and MFA; end its sessions; review the console's audit log and the SQL editor's history; rotate every secret that account could see. |
| **A code or policy bug exposing data** | Turn the feature off: its source gate, its build flag or the function itself. Prepare a fix migration with a rollback, approved by sha256 as usual. Check the logs for who read what. |
| **Data sent to the wrong person** | Ask the recipient to delete it and to confirm in writing. Recall the email if the mailbox allows. Note whether they confirmed. |
| **A lost or stolen device** | Wipe it remotely if possible. End its sessions on every console. Change the passwords it held. Rotate any secret it held in plain text. |
| **Team member misuse** | Remove their access at once (`team-access.md`, offboarding). Preserve their audit trail. Take advice before anything else: misuse can be a crime under DPA 2018 s.170. |
| **A vendor's breach** | Get the vendor's facts in writing: what, whose, when, what they did. Rotate our keys with that vendor. Then assess our own duties (section 5). |
| **Ransom or extortion** | Do not pay and do not negotiate. Contain, preserve evidence, and report to the police. |

### 4.2 Secrets to rotate

| Secret | Where it is used | Rotate |
|---|---|---|
| Supabase secret (service role) key | Edge functions (`SUPABASE_SERVICE_ROLE_KEY`); the link site's server (`SUPABASE_SECRET_KEY` on Vercel) | Supabase dashboard; then the Vercel variable and a redeploy |
| Supabase JWT signing key | Every session | Supabase dashboard. Rotating signs everyone out |
| Push worker secret | Function secret `NOTIFICATION_WORKER_SECRET` and the Vault secret `deliver_notifications_secret` | Both together (`qa/push-notifications-2026-10-30/README.md`) |
| Clean-up and purge worker secrets | `ACCOUNT_CLEANUP_SECRET`, `ACCOUNT_RECEIPT_PURGE_SECRET`, `PROFILE_PHOTO_CLEANUP_SECRET` **[needs C2, C3]** | Function secrets and the matching cron call |
| Expo access token | `EXPO_ACCESS_TOKEN` (sending pushes) | Expo account |
| Apple keys | The APNs key (in EAS credentials); the Sign in with Apple `.p8` key for token revocation **[needs C2]** | Apple Developer account |
| Auth email sending | Resend API key or SMTP password in Supabase Auth | Resend, then Supabase Auth settings |
| SMS provider credentials | The Send SMS hook **[needs C1]** (placeholder 4) | The provider's console, then the hook |
| CAPTCHA secret key | Supabase Auth **[needs OPS-9]** (placeholder 5) | The vendor's console, then Supabase Auth |
| Google OAuth client secret | Supabase Auth's Google provider | Google Cloud console, then Supabase Auth |
| Deploy tokens | Vercel, Expo and EAS, GitHub | Each console |
| Mailbox and log tool passwords | The inboxes; the log tool | Each service |

## 5. The 72-hour test

### 5.1 The four questions

1. **Is it a personal data breach?** (Section 1.) A security incident that touched no personal data is not, but log it as a security note.
2. **When did we become aware?** When we have a reasonable degree of certainty that a security incident has led to personal data being compromised (ICO guidance (x)). A suspicion starts a short investigation; certainty starts the clock. Record the time and why.
3. **Is it likely to result in a risk to people's rights and freedoms?**
   - Unlikely: record it in the log with the reasons, and do not report (Art 33(1), 33(5)).
   - Likely: **report to the ICO without undue delay and, where feasible, within 72 hours** of awareness. The 72 hours include weekends and bank holidays.
4. **Is it likely to result in a high risk?** Then also **tell the people affected without undue delay** (Art 34).

When unsure, report. The ICO's online self-assessment can help.

### 5.2 Weighing the risk for Resbite

Consider the kind of data, how many people, how easily they can be identified, what could happen to them, and whether the data was encrypted or already public. A guide:

| Data involved | What could happen | Usual weight |
|---|---|---|
| Access to someone's account | Reading their chats and plans; posting as them; arranging a meet-up in their name | High |
| Meeting places and dates (which can be home addresses), guest lists | Someone turning up uninvited; burglary while people are out; stalking | High |
| Reports, including allegations of offences, and who made them | Retaliation against a reporter; harm to a reported person's reputation | High |
| Blocks and hidden connection refusals | Revealing who is avoiding whom; harassment | High |
| Chat messages | Loss of confidentiality; may reveal health, beliefs or relationships | Medium to high, depending on the content |
| Phone numbers of users and of people who are not users | Spam, scams, targeted phishing, SIM-swap attempts | Medium |
| Profile photos with names | Identification of people who expected only friends to see them | Medium |
| Email addresses | Phishing | Low to medium |
| Push tokens, hashed codes, link-open counts | Little on their own | Low |

Weigh it up: the same data is more serious if an attacker had it, and less if a trusted recipient deleted it at once.

## 6. Reporting to the ICO

- **How.** Online, through the personal data breach reporting page on ico.org.uk; the ICO asks organisations to report online unless they cannot. Its helpline (0303 123 1113, check the hours on ico.org.uk) gives urgent advice. Have the data protection fee registration number ready (placeholder 2).
- **What** (Art 33(3)):
  - the nature of the breach, including the categories and approximate number of people and records;
  - the contact point: the owner, through privacy@resbite.com;
  - the likely consequences;
  - what we have done or propose to do, including steps to reduce possible harm.
- **In phases.** If we do not have every fact within 72 hours, report what we know and send the rest as it comes (Art 33(4)).
- **Late.** If we report after 72 hours, give the reasons for the delay.
- **Record** the date, the time, the reference the ICO gives, and a copy of what we sent, in the log.

## 7. Telling the people affected

**When.** Without undue delay, where the breach is likely to result in a high risk to them (Art 34). The ICO can also tell us to.

**Not needed** if (Art 34(3)): the data was protected so it is unintelligible (for example, encrypted with a key that was not compromised); or we have since made the high risk no longer likely; or contacting each person would take disproportionate effort, in which case we make a public notice instead.

**What to say** (Art 34(2)), in plain words: what happened; the contact point; the likely consequences; what we have done; what they can do to protect themselves.

**How.**
- Email, where the account has a confirmed email.
- A text message to the verified number **[needs C1]**: short, pointing to the full notice.
- A push notification only as a pointer ("Important information about your Resbite account: check your email"), never with details: pushes travel through Expo in the US and show on the lock screen.
- A public notice on https://link.resbite.com/support **[needs D1]** when individual contact is disproportionate, and for people who are not users when we cannot reach them.

Templates B1 to B3 (section 12).

## 8. Who else to tell

| Who | When |
|---|---|
| The solicitor | Every breach we report, and any we are unsure about |
| Processors involved | When their service is part of the cause or the fix |
| The police | When a crime may have been committed: 101, or 999 if anyone is in danger. Fraud and cyber crime also go to the national reporting service. Keep the crime reference in the log |
| Our insurer | If the company has cover, within its deadline (placeholder 6) |
| Apple, Google | If a breach involves their sign-in tokens or keys, follow their key-revocation process. There is no general duty to notify them |
| The NCA | If the breach exposed child sexual abuse material: follow `moderation-standard.md` section 9 |

Ofcom has no breach-reporting duty for us. A breach that is also an online safety failure is recorded in the risk assessment review (A13).

## 9. After the breach

1. Fix the cause, and check the fix.
2. Record the lessons and the follow-up actions, each with a role and a date.
3. Update the DPIA (A9), the risk assessment (A13), the vendor register (A18) or this runbook if they were wrong.
4. Close the log entry when every action is done.

## 10. The breach log

Kept outside the repo, in the log tool (placeholder 3), access-restricted to the owner. It holds as little personal data as possible: counts and categories, not names, numbers or account ids, unless an id is needed to act. Every breach and every near miss is logged, including those we decide not to report, with the reasons (Art 33(5)). The ICO may ask to see it.

| Field | Content |
|---|---|
| Reference | BR-YYYY-NNN |
| Status | Open, monitoring or closed |
| Reported | By whom (role), when, how |
| Aware | When the owner became aware, and why that moment |
| What happened | In plain words |
| Cause | Root cause, once known |
| Data and people | Categories of data; categories and approximate number of people; approximate number of records |
| Containment | Each step and its time |
| Risk | Likelihood and severity, with the reasoning (section 5.2) |
| ICO | Reported or not; if reported, date, time and the ICO's reference; if not, why not |
| People told | Yes or no; when and how; if not, why not |
| Others told | Solicitor, police (crime reference), processors, insurer |
| Actions | Follow-up actions, each with a role and a due date |
| Closed | Date |

Retention: placeholder 7.

## 11. The first entry: the phone-code test-mode review (F5)

The C1 switch-off sitting records this entry, whatever it finds (gap analysis F5, section 7 risks). Copy it into the log at the sitting and complete it.

> **BR-2026-001 · Phone-code test mode: was it used by anyone other than the testers?**
>
> **Status:** Open until the review at the switch-off sitting (C1).
>
> **Background.** Phone accounts went live on the hosted project on 28 October 2026 with test mode on (decision CI-D13): the Send SMS hook stored each code instead of sending it, and `public.exchange_test_code`, which anyone may call before signing in, swapped the fixed code `000000` for the stored one (`supabase/migrations/20261027120000_phone_accounts.sql`; `supabase/migrations/20261030130000_phone_key.sql`). The app and the link site both made the swap. So anyone who knew a phone number could sign in to that number's account, or create an account with someone else's number. From 16 November 2026 any confirmed account could use the app (the open beta), which widened what a new account could do.
>
> **Period.** From the day phone sign-in was switched on in the Auth dashboard after the 28 October migration (take the date from the hosted records) to the switch-off: [date of the C1 sitting].
>
> **Data at risk.** For any account signed in to this way: everything that account could see (its resbites, guest lists, meeting places and details, chats, connections). For any account created this way: the misuse of someone else's number. Also every number that asked for a code, with its latest code, held in `private.test_codes`.
>
> **Review**, at the sitting, following `qa/phone-accounts-2026-10-27/README.md` step 7:
> 1. Test mode off and `private.test_codes` emptied (7.1); every session revoked (7.2).
> 2. Every `exchanged` row in `private.test_mode_log` checked against the known testers (7.3). The log holds the number's last two digits, the account id and the time. The list of known testers is kept outside the repo.
> 3. Every Auth identity created while test mode was on checked against the same testers (7.4).
>
> **Decision rule.** If every row and identity belongs to a known tester or a team test account, there was no unauthorised access: record "no breach found", with the counts. If any does not, treat it as a possible breach: the owner became aware at that moment, the 72-hour clock starts, and sections 4 to 7 apply.
>
> **Record here:** rows reviewed [n]; matched [n]; unmatched [n]; identities reviewed [n]; matched [n]; unmatched [n]; decision and reasoning; ICO report (yes or no, and why); people told (yes or no, and why).
>
> **Then.** Only after this entry is complete, the later C1 migration drops `public.exchange_test_code`, `private.test_codes` and `private.test_mode_log`. Never drop the log before the review is recorded.

**A candidate second entry, for the owner to decide.** While a push request is pending, `pg_net` keeps it, including the `Authorization` header with the worker secret, in `net.http_request_queue`, which the dashboard can read for a moment (`qa/push-notifications-2026-10-30/README.md`, step 4). Only the owner has dashboard access today. It is a security weakness, not a personal data breach unless the secret was misused; log it as a security note, and rotate the secret if the backup moderator is given Developer access (`team-access.md`).

## 12. Templates

Every email ends with this signature (company particulars, DOC-7):

> Resbite Ltd · Registered in England and Wales, company number 12450334 · Registered office: 86-90 Paul Street, London EC2A 4NE, United Kingdom · VAT number: [[OWNER: VAT number, or delete if not VAT-registered]] · privacy@resbite.com

### B1. Notice to the people affected (email)

> **Subject:** Important: a security problem affecting your Resbite account
>
> Hello,
>
> **What happened.** On [date] we found that [plain description: for example, "someone may have signed in to your Resbite account without your permission between [date] and [date]"].
>
> **What it involved.** [The data: for example, "your resbites, the people invited to them, their meeting places, and your chat messages".]
>
> **What it could mean for you.** [The likely consequences, plainly: for example, "someone may know where and when your next resbite is".]
>
> **What we have done.** [For example: "We closed the weakness on [date], signed everyone out, and reported this to the Information Commission (ICO)."]
>
> **What you can do.** [For example: "Sign in again and check your upcoming resbites and chats. If anything looks wrong, change the meeting details or cancel, and tell us. Be careful with messages that ask for codes or money: we will never ask for your sign-in code."]
>
> **Questions.** Write to privacy@resbite.com. You can also complain to the Information Commission (ICO): ico.org.uk.
>
> We are sorry this happened.
>
> Resbite
>
> [Signature]

### B2. Notice by text message

> Resbite: a security problem may have affected your account. We have sent details to your email [or: Details: link.resbite.com/support]. We will never ask for your sign-in code.

### B3. Public notice (on /support)

> **Security notice, [date].** [What happened, in two or three sentences.] [Who may be affected.] [What we have done.] [What people can do.] If you think you are affected, write to privacy@resbite.com. Resbite Ltd, company number 12450334.

### B4. First report to the owner

> Possible data breach. Seen [time] by [role]. What: [one line]. Systems: [which]. Personal data involved: [yes / no / unsure]. Done so far: [nothing / signed out device / …]. Nothing attached.

## 13. Practice

Once a year, walk through one scenario from section 4.1 with the backup moderator, using made-up facts, and check that this runbook, the rotation list and the contacts are still right.

## 14. What must be built for this runbook to work in full

| Item | What this runbook needs from it |
|---|---|
| C1, F5 | The switch-off sitting, the log review recorded as BR-2026-001, then the test-code tables dropped |
| C2, C3 | The clean-up and purge workers, whose secrets join the rotation list |
| D1 | /support, for public notices |
| F1 | The privacy inbox, the contact point |
| F7, A18 | Processor agreements with breach-notification terms, in the vendor register |
| F10 | Alerts, so failures and anomalies are seen quickly |
| F16, A24 | MFA on every admin account; signed instructions for the backup, including any authority to file an initial ICO report |
| OPS-9 | The CAPTCHA vendor, whose secret joins the rotation list |

## 15. Sources

- UK GDPR Arts 4(12), 33 and 34 (text not re-read; legislation.gov.uk returned empty pages): https://www.legislation.gov.uk/eur/2016/679/article/33 ; https://www.legislation.gov.uk/eur/2016/679/article/34
- ICO, Personal data breaches (x): https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/
- ICO, 72 hours: how to respond to a personal data breach (x): https://ico.org.uk/for-organisations/sme-web-hub/72-hours-how-to-respond-to-a-personal-data-breach
- GOV.UK, the Information Commission succeeds the ICO: https://www.gov.uk/government/news/information-commission-succeeds-the-ico-as-uks-data-protection-regulator
- DPA 2018 s.170, unlawful obtaining of personal data: https://www.legislation.gov.uk/ukpga/2018/12/section/170
- `qa/phone-accounts-2026-10-27/README.md`, step 7 (the switch-off sitting); `qa/push-notifications-2026-10-30/README.md`, step 4 (the worker secret)

(x) means read only through search-engine extracts, because the site refused automated reads.
