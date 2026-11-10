# WhatsApp, Telegram and UK rules for phone verification and automatic invitations

Researched 3 November 2026, read-only. Every source was accessed on **2026-11-03**; `[n]` points to the numbered Sources list at the end. Prices are out of scope (see `prices.md`). **Inference** marks my reading of a text, not a legal conclusion. This is not legal advice.

Method note: Meta, Telegram, Supabase, WhatsApp Help Center, asa.org.uk and legislation.gov.uk were read directly. **ico.org.uk and ofcom.org.uk refused automated access (bot check, HTTP 403)**, so every ICO and Ofcom passage below comes from search-engine extracts of those pages. Each is marked *(search extract)* and must be checked against the live page before anyone relies on it.

## Answers

**(a) Verification: yes for both, with limits.** WhatsApp has a dedicated *authentication template* (fixed text "<code> is your verification code.", with a copy-code, one-tap or zero-tap button), but the code only reaches people who have WhatsApp on their primary device [3][13]. Supabase supports `channel: 'whatsapp'` only through its built-in Twilio and Twilio Verify providers [18][19]. Resbite's own Send SMS hook could also route codes to WhatsApp, since Supabase's docs show this [20]. Telegram Gateway exists only to send codes to numbers that have a Telegram account. It is not a Supabase built-in, so it would go through the hook [23][24]. **Inference:** either channel needs an SMS fallback for people without the app. Separately, Telegram Login (now OpenID Connect) can return a *verified phone number* if the user agrees [27]. That makes it a third option, but it is untested with Supabase.

**(b) Automatic invitations to phone numbers: Telegram, no. WhatsApp and SMS: technically yes, but not lawfully or within the rules for a first message to a friend's number.** Telegram has no channel for it: Gateway carries codes only, bots "can't start conversations with users", and the Bot API has no way to address a phone number [23][25][26]. WhatsApp's policy allows contact only if the recipient gave *you* their number **and** opted in to your messages [1]. A number typed in by a host meets neither condition. **Inference:** Meta would most likely class such a message as marketing [6]. For SMS, and for WhatsApp too, the UK test is PECR regulation 22. If Resbite's message promotes Resbite (its wording, a "get the app" link), it is most likely direct marketing *sent* by Resbite. That needs the recipient's prior consent, and the ICO says refer-a-friend consent is unlikely to be possible in practice [31][45 *(search extract)*]. **Inference:** today's design, where the host sends a neutral message, is the low-risk path.

**(c) UK rules for such invitations.** PECR reg 22 (consent, the soft opt-in, "instigate") and reg 23 (no concealed sender, a valid opt-out address) apply [31][32]. Since **5 Feb 2026**, PECR fines go up to **£17.5m or 4% of worldwide turnover** under the Data (Use and Access) Act 2025 [33][35][37]. UK GDPR covers the invitee's number: a lawful basis (legitimate interests, three-part test), an Article 14 notice at the latest at the first message, minimisation and retention [38][39][48 *(search extract)*]. Other layers: E-Commerce Regs reg 7 for commercial communications [40], CAP Code s.10 and the DMCCA ban on "persistent and unwanted solicitations" [54][41], and Ofcom's network-side controls on business SMS (details unconfirmed) [52][53]. SIM farms have been criminal since **29 Oct 2026**, which matters only for picking an SMS supplier [42][43]. WhatsApp's and Telegram's own opt-in rules apply on top as contract terms [1][24].

## Part 1: WhatsApp Business Platform

### 1.1 Verification (authentication templates)
> "<VERIFICATION_CODE> is your verification code." [3]

- Content is preset and not editable. The only options are a security line ("For your security, do not share this code."), an expiry footer of 1 to 90 minutes, and the button [3]. Upsert rejects `text` and `autofill_text` [3]. The one-tap page says "URLs, media, and emojis are not supported." [4]
- **Copy code** works on every platform. **One-tap autofill** is "only supported on Android" and needs a handshake. Without it, "the message falls back to a copy code button", and the handshake must be under 10 minutes old [4]. On iOS, "Keyboard suggestions" fill the code on iOS 26+ with "no integration required"; "Earlier iOS versions do not support autofill" [3][4].
- **Zero-tap**: "Zero-tap is only supported on Android." If it fails, the button falls back to one-tap and then to copy code. You must accept `zero_tap_terms_accepted` and "Make it clear to your app users that the password or code will be automatically delivered" [5].
- "authentication messages are only delivered to a user's primary WhatsApp device" (linked-device security, Cloud API only) [3]. Meta asks you to "Confirm the user's WhatsApp phone number before sending" [3].
- The recipient must have WhatsApp. Error 131026 lists "The recipient phone number is not a WhatsApp phone number." [13]. "Only authentication templates can be used to send a one-time passcode" [6].
- **Supabase** (Phone sign-in, "Updated Oct 26, 2026"): "At this time, WhatsApp is only supported as a channel for the Twilio and Twilio Verify Providers." [18] signInWithOtp: "you will need to configure a Whatsapp sender on Twilio"; "The whatsapp channel is not supported on other providers at this time." [19] The Send SMS hook "replaces Supabase's built-in SMS sending". Its payload is `user` plus `sms` (with the OTP) and has **no channel field**, yet the docs suggest you "Use alternate messaging channels such as WhatsApp" [20].
- **Inference:** Resbite keeps its hook (and so its test mode). The hook body would then pick WhatsApp or SMS for each number, because Supabase passes no channel. If the code goes to WhatsApp and the person has no WhatsApp, the hook must fall back to SMS.

### 1.2 Can a business message a number that never messaged it?
Only with an approved template, and only after opt-in.
> "You may only contact people on WhatsApp if: (a) they have given you their mobile phone number or username; and (b) you have received opt-in permission from the recipient confirming that they wish to receive subsequent messages or calls from you." [1]
> "You are solely responsible for determining the method of opt-in, that you have obtained opt-in in a manner that complies with laws applicable to your communications" [1]
> "You may only initiate conversations using an approved Message Template" [1]
> "Do not confuse, deceive, defraud, mislead, spam, or surprise people with your communications." [1]
> "Businesses are required to obtain opt-in before messaging people on WhatsApp." / "Businesses must clearly state the business's name that a person is opting in to receive messages from." / "It is up to businesses to determine the method of opt-in." [2]

The policy page shows "Last updated: September 23, 2026" [1]. Opt-in methods Meta lists: SMS, website, IVR call, in person or on paper [2]. Best practice: "Obtaining separate opt-in by specific message category" [1].

**Inference:** a host-supplied number fails test (a), because the friend did not give Resbite their number. It fails (b) too: the friend never opted in to Resbite. Meta places the responsibility on the business, not on itself.

### 1.3 How Meta would categorise "Marcos invites you to a picnic on Saturday, open the link to reply"
- Utility: "typically triggered by a user action or request"; must be "non-promotional" and "specific to or requested by the user" [6].
- The marketing examples include Awareness, "Join us at {{location}} on {{date}} to celebrate with friends and family.", and App Promotion, "Request customers to install or take a specific action with your app" and "your friend {{name}} recently joined our community" [6].
- Meta has five categories: Marketing, Utility, Authentication, Service and Meta Business Agent [16]. Mixed content counts as marketing. Meta re-categorises templates on a recurring basis with "A 1-day advance notice" [6].
- **Inference:** the recipient requested nothing, and the text matches the "Awareness" event example. Meta would most likely class it as **marketing**, and certainly so once it carries a "get the app" link.

### 1.4 Limits, the US pause, quality, verification, sender identity
- **Per-user marketing limits:** "WhatsApp may limit the number of marketing template messages a WhatsApp user receives from any business". The limit "adapts automatically" to engagement, and a failed send returns error 131049 ("wait at least 24 hours") [7][13].
- **US pause:** "WhatsApp does not currently deliver marketing template messages to WhatsApp users with United States phone numbers" (+1 with a US area code) [7]. The current page names no start date and no other country [7]. Error 130497 covers accounts "restricted from messaging to users in certain countries" by business category [13].
- **Messaging limits:** these cap "unique WhatsApp user phone numbers" reached outside a customer-service window in a moving 24 hours. A new portfolio starts at **250**. Ways to scale: "Verify your business", or 2,000 high-quality delivered messages in 30 days. Tiers are 2,000, 10,000, 100,000 and unlimited, shared across the portfolio's numbers, and scaling past 2,000 needs "high-quality messages" [8].
- **Quality:** templates are rated GREEN, YELLOW, RED or UNKNOWN from "negative feedback" and "low read-rates". RED templates "are in danger of being paused or disabled" [9].
- **Business verification:** it is done "in the Facebook Business Manager" (documents are listed in Meta's Help Centre, which did not render for me) [15]. Verification raises the number cap from 2 to 20 [10] and is required for the blue tick (Official Business Account) [12].
- **Who appears as sender:** messages come from a registered *business* phone number that the business must own. "Numbers already in use with WhatsApp cannot be registered unless they are deleted first." [10] The recipient sees the business's display name or number [11]. **Inference:** an API message always comes from Resbite, never from the host's own number.

### 1.5 Checking whether a number has WhatsApp
- Meta's current docs index lists no endpoint for checking whether a number is on WhatsApp. The only "Contacts" entry is for *sending* contact cards (Meta's llms.txt index, listed under [3]). The On-Premises API, where `/contacts` lived, is sunset: its last client "caducó el 23 de octubre de 2025" (expired 23 Oct 2025) [14].
- Vendors report that `/contacts` returned "valid" for every number from v2.43 and that the Cloud API has no equivalent (Blip, Genesys). This is **secondary and unconfirmed** [56].
- **Inference:** the only supported signal is after the fact: send, then handle error 131026 and fall back to SMS [13]. Meta's one-tap page also suggests you "check WhatsApp installation" on the device before offering the option [4].

### 1.6 Alternatives that keep the host as sender (today's design)
> "Use https://wa.me/<number> where the <number> is a full phone number in international format. Omit any zeroes, brackets, or dashes" … "Use https://wa.me/whatsappphonenumber?text=urlencodedtext" [17]

Click to chat opens a chat "As long as you know this person's phone number and they have an active WhatsApp account" [17]. The host presses Send from their own account. The OS share sheet and `sms:` composer work the same way. **Inference:** none of this goes through the Business Platform, so Meta's business opt-in and template rules do not apply. The UK analysis in 3.2 still matters for the *wording* Resbite pre-fills.

## Part 2: Telegram

### 2.1 Telegram Gateway (verification codes)
> "The Gateway API is an HTTP-based interface created for developers looking to deliver automated messages, such as verification codes, to users who registered their phone number on Telegram." [23]

- **Content:** `sendVerificationMessage` takes `phone_number` (E.164), `request_id` (from checkSendAbility), `sender_username` (a verified channel), `code` ("Only fully numeric strings between 4 and 8 characters"), `code_length`, `callback_url`, `payload` ("will not be displayed to the user") and `ttl` (30 to 3600 s) [23]. **There is no free-text parameter.** **Inference:** Gateway cannot carry an invitation, a link or any other content.
- **checkSendAbility** checks "the ability to send a verification message to the specified phone number". If it can, a fee applies, and the follow-up send with that `request_id` is then free. "If they cannot, your request will be free of charge." [22][23] Sends to your own number are free [23].
- **Other methods:** `checkVerificationStatus` can validate the user's code. `revokeVerificationMessage` "does not guarantee that the message will be deleted" [23].
- **Delivery reports:** POSTed to `callback_url`, signed (X-Request-Timestamp, X-Request-Signature, HMAC-SHA-256), retried until HTTP 200. Statuses: sent, delivered, read, expired, revoked [23].
- **Abuse and opt-in terms:** "Unsolicited messages to users who have not provided explicit consent are strictly forbidden." / "Users should always allow, expect and recognize the messages you send them." / misrepresenting "the origin (i.e., sender) or purpose of your messages", and "data scraping or user enumeration", will "result in immediate termination" [24]. The FAQ says numbers "must be from users who voluntarily shared their number with the service" [22].
- **Inference:** a user typing their own number to get a code fits these terms. A host typing a friend's number does not. Using checkSendAbility to probe whether friends are on Telegram risks counting as "user enumeration".

### 2.2 Bots cannot start conversations or message phone numbers
> "Bots can't start conversations with users. A user must either add them to a group or send them a message first." [25]

`sendMessage.chat_id` is a "Unique identifier for the target chat or username of the target bot, supergroup or channel" [26]. No parameter takes a phone number. `request_contact` sends "the user's phone number … as a contact when the button is pressed", and only in private chats [26].

### 2.3 Telegram Login as a sign-in option
- The page at /widgets/login now describes **OpenID Connect** ("Authorization Code Flow with PKCE"). Its scopes are `openid`, `profile`, `phone` ("User's verified phone number. Requires user consent.") and `telegram:bot_access` [27]. The token carries `phone_number` and `phone_number_verified` [27]. "Telegram does not currently provide a separate UserInfo endpoint." [27]
- The **legacy** widget returns only "id, first_name, last_name, username, photo_url, auth_date and hash", with **no phone** [28]. There, a number came only through a bot's `request_contact` [26].
- The new login proves control of a Telegram account. With `phone` consent, it also hands over Telegram's verified number [27].
- Supabase accepts "any OAuth2 or OIDC-compatible identity provider" as a custom provider (Free plan: up to 3) [21]. **Inference, untested:** Telegram could be added through Supabase's custom OIDC support. The missing UserInfo endpoint may need configuration [27].

### 2.4 The only invitation path: the user shares
> "https://t.me/share/url?url={url}&text={text}" … "Both values should be URL-encoded." / the user can edit the text "before sending the message" [29]

The user picks the chat and sends from their own account [29]. **Inference:** this behaves like wa.me, with the host as sender.

## Part 3: UK rules for sending invitations to phone numbers

### 3.1 PECR: the texts
> reg 2: "'electronic mail' means any text, voice, sound or image message sent over a public electronic communications network which can be stored in the network or in the recipient's terminal equipment until it is collected by the recipient and includes messages sent using a short message service" [30]
> reg 2: "'direct marketing' means the communication (by whatever means) of advertising or marketing material which is directed to particular individuals" (inserted by DUAA from 20.8.2025; same words as DPA 2018 s.122(5)) [30][34]
> reg 22(2): "a person shall neither transmit, nor instigate the transmission of, unsolicited communications for the purposes of direct marketing by means of electronic mail unless the recipient of the electronic mail has previously notified the sender that he consents for the time being to such communications being sent by, or at the instigation of, the sender." [31]
> reg 22(3) (soft opt-in): contact details obtained "in the course of the sale or negotiations for the sale of a product or service to that recipient"; "similar products and services only"; a "simple means of refusing" at collection and in every message [31]
> reg 23: no direct marketing by electronic mail "(a) where the identity of the person on whose behalf the communication has been sent has been disguised or concealed" or "(b) where a valid address to which the recipient … may send a request that such communications cease has not been provided" [32]

- Reg 22 applies to "individual subscribers" [31]. Since 5.2.2026, reg 2(1A) reads "recipient" as "intended recipient" for mail "sent but not received" [30].
- **ICO on scope** *(search extract)*: electronic mail covers "eg emails, text messages, picture or video messages, voicemails, and direct messaging on social media" [46]. The key-concepts page lists in-app messages [46]. An ICO training module lists "messaging apps, for example, WhatsApp and Snapchat" [55]. Push notifications are less clear-cut in the ICO's material [55].
- **Inference:** an SMS or WhatsApp invitation is "electronic mail", so the analysis in 3.2 applies to both. The soft opt-in cannot apply, because the invitee bought nothing from Resbite [31].

### 3.2 Is a friend's invitation carried by Resbite direct marketing instigated by Resbite?
ICO passages *(all search extracts; verify on the live pages)*:
> "Some organisations try to get round the rules by asking people to forward a marketing message to their friends. However, you are 'instigating' them to send that message, so you must still comply with PECR." [44]
> "You don't need to give an incentive for it to count as instigating. It's enough that you actively encourage someone to pass on your message." [45]
> "You must not rely on the soft opt-ins for 'refer a friend' schemes. You must obtain valid consent." [45]
> Refer-a-friend example: a retailer's pre-written email for customers to send. "The retailer is responsible for complying with PECR because it is instigating the electronic mail marketing." [45]
> "You cannot be sure whether the friends actually agreed to give you their details. We would therefore advise against this type of viral marketing." [44]
> "This does not mean you are responsible every time a customer forwards a message without your knowledge – you must have encouraged them to send it." [45]
> Service messages: "Routine customer service messages do not count as direct marketing"; "If your service message has elements that are direct marketing, even if that is not the main purpose of your message, then it will count as direct marketing"; "General branding, logos or straplines in these messages do not count as marketing"; "a key factor is likely to be the phrasing, tone and context." [47]

I did **not** find the ICO factor the brief mentions, "hiding the recipient's identity from the sender", in any extract (see "What I could not confirm").

**Inference, by scenario:**
1. *Resbite sends the SMS or WhatsApp itself, with Resbite's wording and a "get the app" link.* Resbite is the **sender**, not just the instigator. A message that promotes Resbite's app is most likely "advertising or marketing material" for Resbite [30]. Reg 22(2) then needs the invitee's prior consent to Resbite, which cannot exist before the first message. The ICO's refer-a-friend passages point the same way. **High risk.**
2. *Resbite sends a strictly neutral message (host name, event, reply link; no promotion of Resbite).* There is an argument that this is the host's message relayed by a service, not marketing. But the ICO's service-message idea is framed around "customers", and the invitee is not one. Any growth element (an app link, a brand pitch) would likely tip it into marketing [47]. **Uncertain; needs legal advice and an LIA/DPIA before launch.**
3. *Today's design: the host sends from their own WhatsApp or Messages with Resbite's pre-filled text.* The current text is `"{host} invited you to {title}, {when}. Reply here: {link}"` (`mobile/src/domain/contactInvites.ts`). It contains no promotion, the host chooses each recipient and presses Send, and there are no rewards. On the ICO's own words, instigation needs encouragement to pass on *marketing*. A neutral personal invitation is not obviously marketing material. **Lowest risk.** It would rise if Resbite added "Get Resbite" copy, rewards for inviting, or bulk "invite all contacts" prompts [45].

### 3.3 Data (Use and Access) Act 2025: what changed in PECR
- **Penalties:** s.115 replaced reg 31 and Schedule 1 (in force 5.2.2026, S.I. 2026/82) [36][37]. PECR breaches now use the DPA 2018 penalty regime. For regs 5–8, 14, 19–23, 24 and 32B(4)/(5), the cap is "the higher maximum amount" [33]: "£17,500,000 or 4% of the undertaking's total annual worldwide turnover … whichever is higher" [35]. The ICO says it is "developing separate guidance to cover these higher fines" *(search extract)* [50].
- **Definitions:** "direct marketing" moved into PECR reg 2 (20.8.2025, S.I. 2025/904), and "communication" was widened to "transmitted to". Reg 2(1A) on sent-but-not-received items came in 5.2.2026 [30][37].
- **Other provisions:** the charity soft opt-in (reg 22(3A), 5.2.2026) does not help Resbite [31]. There are new cookie exceptions (s.112) and codes of conduct (s.116), both commenced 5.2.2026 [37]. The ICO became the **Information Commission** on 30.9.2026 (S.I. 2026/1015) [30][37].
- **UK GDPR:** new Art 6(11) lists "processing that is necessary for the purposes of direct marketing" as an *example* of a legitimate interest [38]. This does not remove PECR's consent rule for electronic mail.

### 3.4 UK GDPR for the invitee's number
- **Lawful basis.** Art 6(1)(f) applies unless "overridden by the interests or fundamental rights and freedoms of the data subject" [38]. The ICO's three-part test is purpose, necessity ("is there another less intrusive way") and balancing, recorded in a legitimate interests assessment *(search extract)* [48].
- **Transparency (Art 14),** for data "not obtained from the data subject":
> Art 14(3): "(a) within a reasonable period after obtaining the personal data, but at the latest within one month … (b) if the personal data are to be used for communication with the data subject, at the latest at the time of the first communication" [39]
  The notice must include the source of the data (14(2)(f)) and the right to object (14(2)(c)) [39]. The ICO *(search extract)*: "It is difficult to argue disproportionate effort if you are contacting the individual as part of your processing." [49]
- **Minimisation and retention:** keep only what the purpose needs (Art 5(1)(c) and (e), not re-read for this note). **Inference:** today's phone-key hashing of host-picked numbers fits this. A deletion rule for non-users' numbers is needed.
- **Address-book uploads:** I found **no ICO guidance specific to contact uploads**. Search returned only general principles (controller status, transparency for data from third parties) [49].

### 3.5 Transactional messages (one-time codes)
- **Inference:** a code the person requested for their own sign-in is not "advertising or marketing material" [30]. It falls outside regs 22 and 23, which apply only to "the purposes of direct marketing" [31][32]. Reg 23's sender-identity rule therefore does **not**, on its text, apply to a pure code. Adding promotion would change that [47].
- What still applies: UK GDPR (a privacy notice at sign-up under Art 13, not re-read for this note), the gateway terms (Telegram bans misrepresenting "the origin (i.e., sender)" [24]), WhatsApp's fixed authentication text [3], and Ofcom's network-side sender-ID controls [52].

### 3.6 Ofcom, the networks and SIM farms
- **Sender-ID registry** *(search extracts of Ofcom documents; not opened)*: Ofcom "considered introducing a mandatory Sender ID registry, but has decided not to". Its proposed rules require operators terminating A2P SMS to "restrict certain types of alphanumeric Sender IDs", with Know-Your-Customer checks at onboarding, "corroborating Sender IDs against KYC information" and "Know Your Traffic" monitoring [52][53]. The MEF SMS SenderID Protection Registry is **voluntary**, per Ofcom's documents [53]. A statement titled as "Published 15 July 2026" exists, but I could not read its final rules or dates [53].
- **SIM farms:** "A person who possesses a SIM farm commits an offence" (Crime and Policing Act 2026 s.151; s.152 covers supply). A SIM farm is a device "capable of using five or more SIM cards simultaneously or interchangeably" for calls or messages (s.153). Both are **in force 29.10.2026** (S.I. 2026/960 reg 5(a)); a later amendment, S.I. 2026/1111, leaves them untouched [42][43]. **Inference:** this matters only when vetting an SMS supplier.
- **Network marketing rules (STOP, hours):** I found **no primary source** for UK operator rules on sending hours. Vendor guides conflict (8am–8pm, 9am–8pm, none). The ICO's consumer page *(search extract)* describes opting out by "texting 'STOP' to the telephone number or 5-digit short code" [51].

### 3.7 ASA/CAP Code and consumer law
- CAP 10.7: marketing by electronic mail "must contain the marketer's full name (or, in the case of SMS messages, a recognisable abbreviation) and a valid address; for example, an e-mail address or a SMS short code to which recipients can send opt-out requests." CAP 10.1: "Marketers must not make persistent and unwanted marketing communications by any means." CAP says its data rules are "presently under review" for the DUAA [54].
- DMCCA 2024 Sch 20 para 28 (in force 6.4.2025) bans "Making persistent and unwanted solicitations by any means" [41]. E-Commerce Regs reg 7: a commercial communication must "clearly identify the person on whose behalf the commercial communication is made" [40].
- **Inference:** these bite only if the invitation is a marketing or commercial communication of Resbite's (scenarios 1–2 in 3.2).

### 3.8 WhatsApp and Telegram opt-in as a contract layer
Even where UK law might allow a message, Meta requires the recipient's own number-giving and opt-in, plus template approval [1][2]. Telegram requires "explicit consent" [24]. Both reserve suspension of the account [1][24]. **Inference:** these terms are stricter than PECR scenario 2, so automatic first-contact invitations are ruled out on WhatsApp and Telegram whatever the legal reading.

## Compliance checklist for sending invitations automatically

**If Resbite sends SMS itself**
- [ ] Get legal advice on whether the text is direct marketing (3.2). Run and record an LIA and a DPIA [48].
- [ ] Keep the text strictly neutral: no "get the app", no offers, no Resbite pitch [47]. Otherwise prior consent is needed, which a first message cannot have [31].
- [ ] Name Resbite as sender (an alphanumeric sender ID registered with the supplier) and give a working opt-out such as reply STOP or a link [32][54].
- [ ] In the first message, link a short Art 14 notice: who Resbite is, that "your friend X gave us your number", why, retention, the right to object [39].
- [ ] Send one message per invitation and no automated reminders to non-users [41][54]. Honour opt-outs across all hosts with a suppression list [54].
- [ ] Rate-limit per host and per number (SMS pumping). Check the supplier's KYC and sender-ID rules under Ofcom's 2026 measures and confirm it runs no SIM farms [42][52].
- [ ] Delete non-users' numbers when the event ends or they decline. Keep send logs.

**If Resbite sends WhatsApp itself**
- [ ] Only message people who gave Resbite **their own** number and opted in to Resbite messages, for example a "send updates on WhatsApp" choice on the /i/ page [1][2]. Never a host-supplied number for a first contact.
- [ ] Verify the business in Business Manager, register an owned number and display name, and plan for the 250-user starting limit [8][10][15].
- [ ] Use approved templates. Expect "marketing" for invitations, with per-user limits, the US pause and quality ratings [6][7][9]. Use utility only for updates the person asked for [6].
- [ ] Everything in the SMS list applies too: WhatsApp counts as electronic mail [46][55].

**The current host-sends design (wa.me, Messages composer, t.me/share)**
- [ ] Keep the pre-filled text neutral, as it is now. Let the host edit it. No rewards or "invite all contacts" prompts [45].
- [ ] Put a privacy notice on link.resbite.com/i/<code> covering the source of the number, the purpose, retention and the right to object, within one month of storing the number [39].
- [ ] Keep hashing and minimisation. Set a retention rule for non-users' numbers and an erasure route [38].
- [ ] Never follow up a non-user by SMS or WhatsApp from Resbite's side.

## What I could not confirm
- **ICO text verbatim:** ico.org.uk blocked automated reads (HTTP 403), so all ICO quotes are search extracts. I did not find the "hiding the recipient's identity from the sender" instigation factor, or any ICO guidance on address-book uploads.
- **Ofcom:** I could not open the 15 July 2026 statement, so the final rules, dates and the MEF registry's status rest on search extracts of Ofcom documents only.
- **UK network rules on marketing SMS hours:** no primary source found.
- **Meta:** the start date of the US marketing pause is not on the current page (I recall 1 April 2025 from Meta's earlier notice; unconfirmed). Not confirmed either: the business-verification documents (the Help Centre did not render), whether authentication templates count against messaging limits, and Meta's own statement on `/contacts` before the sunset (the vendor reports are secondary).
- **Telegram login with Supabase** (custom OIDC) is untested. Whether checkSendAbility counts as "user enumeration" is my inference.
- Whether a neutral Resbite-sent invitation is "direct marketing" has **no ICO text on point**; get legal advice.

## Sources (all accessed 2026-11-03)
1. WhatsApp Business Messaging Policy (last updated 23 Sep 2026): https://whatsappbusiness.com/policy/ (business.whatsapp.com/policy redirects here)
2. Meta, Getting opt-in: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in.md
3. Meta, Authentication templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates.md (docs index: https://developers.facebook.com/documentation/business-messaging/whatsapp/llms.txt)
4. Meta, One-tap autofill: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/autofill-button-authentication-templates.md
5. Meta, Zero-tap: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/zero-tap-authentication-templates.md
6. Meta, Template categorization: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization.md
7. Meta, Per-user marketing limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits.md
8. Meta, Messaging limits: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits.md
9. Meta, Template quality: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality.md
10. Meta, Business phone numbers: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers.md
11. Meta, Display names: https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names.md
12. Meta, Official Business Accounts: https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts.md
13. Meta, Error codes: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes.md
14. Meta, On-Premises API (sunset notice): https://developers.facebook.com/docs/whatsapp/on-premises/reference/contacts
15. Meta, Business verification: https://developers.facebook.com/docs/development/release/business-verification
16. Meta, Pricing (message categories only, no prices used): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md
17. WhatsApp Help Center, How to use click to chat: https://faq.whatsapp.com/5913398998672934/?locale=en_US
18. Supabase, Phone sign-in: https://supabase.com/docs/guides/auth/phone-login
19. Supabase, signInWithOtp: https://supabase.com/docs/reference/javascript/auth-signinwithotp
20. Supabase, Send SMS hook: https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
21. Supabase, Custom OAuth/OIDC providers: https://supabase.com/docs/guides/auth/custom-oauth-providers
22. Telegram Gateway overview and FAQ: https://core.telegram.org/gateway
23. Telegram Gateway API: https://core.telegram.org/gateway/api
24. Telegram Gateway Terms of Service: https://telegram.org/tos/gateway
25. Telegram, Bots introduction: https://core.telegram.org/bots
26. Telegram Bot API (sendMessage, KeyboardButton.request_contact): https://core.telegram.org/bots/api
27. Telegram, Log In With Telegram (OIDC): https://core.telegram.org/widgets/login
28. Telegram Login Widget (legacy): https://core.telegram.org/widgets/login-legacy
29. Telegram Sharing Button: https://core.telegram.org/widgets/share
30. PECR 2003 reg 2 (latest revised): https://www.legislation.gov.uk/uksi/2003/2426/regulation/2
31. PECR reg 22: https://www.legislation.gov.uk/uksi/2003/2426/regulation/22
32. PECR reg 23: https://www.legislation.gov.uk/uksi/2003/2426/regulation/23
33. PECR Schedule 1: https://www.legislation.gov.uk/uksi/2003/2426/schedule/1
34. DPA 2018 s.122: https://www.legislation.gov.uk/ukpga/2018/12/section/122
35. DPA 2018 s.157: https://www.legislation.gov.uk/ukpga/2018/12/section/157
36. Data (Use and Access) Act 2025, contents, s.115 and s.142: https://www.legislation.gov.uk/ukpga/2025/18/contents , https://www.legislation.gov.uk/ukpga/2025/18/section/115 , https://www.legislation.gov.uk/ukpga/2025/18/section/142
37. DUAA Commencement No. 1 (S.I. 2025/904), No. 6 (S.I. 2026/82, reg 2), No. 9 (S.I. 2026/1015): https://www.legislation.gov.uk/uksi/2025/904/contents/made , https://www.legislation.gov.uk/uksi/2026/82/regulation/2/made , https://www.legislation.gov.uk/uksi/2026/1015/contents/made
38. UK GDPR Art 6: https://www.legislation.gov.uk/eur/2016/679/article/6
39. UK GDPR Art 14: https://www.legislation.gov.uk/eur/2016/679/article/14
40. Electronic Commerce (EC Directive) Regulations 2002 regs 2 and 7: https://www.legislation.gov.uk/uksi/2002/2013/regulation/7
41. Digital Markets, Competition and Consumers Act 2024 Sch 20: https://www.legislation.gov.uk/ukpga/2024/13/schedule/20
42. Crime and Policing Act 2026 ss.151 and 153: https://www.legislation.gov.uk/ukpga/2026/20/section/151 , https://www.legislation.gov.uk/ukpga/2026/20/section/153
43. Crime and Policing Act 2026 (Commencement No. 3) Regs, S.I. 2026/960 reg 5, and amendment S.I. 2026/1111: https://www.legislation.gov.uk/uksi/2026/960/regulation/5/made , https://www.legislation.gov.uk/uksi/2026/1111/regulation/2/made
44. ICO, Electronic mail marketing *(search extract only)*: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
45. ICO, How do we comply with the PECR electronic mail marketing rules? *(search extract only)*: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/
46. ICO, Key concepts for direct marketing using electronic mail *(search extract only)*: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/key-concepts-for-direct-marketing-using-electronic-mail/
47. ICO, Identify direct marketing *(search extract only)*: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/
48. ICO, Legitimate interests *(search extract only)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests/
49. ICO, When should we provide privacy information? *(search extract only)*: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/when-should-we-provide-privacy-information/
50. ICO, DUAA summary: Privacy and electronic communications *(search extract only)*: https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/the-data-use-and-access-act-2025-duaa-summary-of-the-changes/privacy-and-electronic-communications/
51. ICO, Texts (for the public) *(search extract only)*: https://ico.org.uk/for-the-public/texts
52. Ofcom, Consultation: Combatting mobile messaging scams *(search extract only)*: https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-3-4-weeks/consultation-combatting-mobile-messaging-scams/main-document/consultation-combatting-mobile-messaging-scams.pdf?v=406897
53. Ofcom, Statement: Combatting mobile messaging scams, "Published 15 July 2026" *(search extract only, not opened)*: https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-3-4-weeks/consultation-combatting-mobile-messaging-scams/main-document/statement-combatting-mobile-messaging-scams.pdf?v=422471
54. CAP Code, Section 10 Use of data for marketing: https://www.asa.org.uk/type/non_broadcast/code_section/10.html
55. ICO, Data Protection and PECR training, Module 14 *(search extract only)*: https://ico.org.uk/media2/nngcyp2q/module-14-pecr.pdf
56. Blip, "WhatsApp channel update: Check Contact" *(secondary, unconfirmed)*: https://help.blip.ai/hc/en-us/articles/10635343431319
