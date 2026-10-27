// The personal invitation page's steps (contact invitations, Task 11; mockup invitee-web-journey screens 2–3 and
// direction A): confirm the invited number behind the 18+ tick, the code, the answer and the get-the-app screen.
// It talks to Supabase Auth and REST directly with the publishable key (the CSP allows only that host) and keeps the
// session in this origin's storage, one entry per invitation code with the full number verified for it, until the
// event starts, so the same browser sees its answer again. "Not you? Sign out" ends it. Words and step logic:
// personal-flow.mjs.
// The open link /r/<code> runs it in open mode (data-mode="open"; open-link approval, plan 3): any number can answer,
// so nothing is checked against an invited number; the answer goes to request_to_join and waits for the host, and the
// last step is waiting, not added, or already on the resbite (my_join_request when the page comes back).
import {
  PAGE_COPY as C,
  RESEND_DELAY_MS,
  RESPONSES,
  dropKept,
  endingOf,
  errorText,
  initialState,
  isTestCode,
  keptEntry,
  maskNumber,
  needsName,
  next,
  readKept,
  rpcError,
  sameNumber,
  screenForRequest,
  screenForReturn,
  sendError,
  sessionExpired,
  sessionFrom,
  signOutKept,
  sweepKept,
  verifyError,
  writeKept,
} from "./personal-flow.mjs";

/** A small element builder: `text` sets textContent, `on…` adds a listener, true sets an empty attribute. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (name === "class") el.className = value;
    else if (name === "text") el.textContent = value;
    else if (name.startsWith("on")) el.addEventListener(name.slice(2), value);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child);
  return el;
}

/** This origin's localStorage, or a stand-in that keeps nothing when the browser blocks it. */
function pageStorage() {
  try {
    const storage = window.localStorage;
    if (storage) return storage;
  } catch {
    // Blocked: fall through.
  }
  return { length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {} };
}

/** Only https addresses become links; an unset or odd one leaves plain words. */
const httpsUrl = (value) => (/^https:\/\/[^\s"'<>]+$/.test(value ?? "") ? value : "");

function start(main, answerButton) {
  const data = main.dataset;
  const base = (data.supabaseUrl || "").replace(/\/+$/, "");
  const key = data.publishableKey || "";
  const code = data.code || "";
  // The open link names no number: no ending to match, and the page's calling code for numbers typed without +.
  const open = data.mode === "open";
  const country = data.country || "";
  const ending = data.ending || "";
  const host = data.host || "";
  const termsVersion = data.termsVersion || "";
  // When the event starts the answer closes, and the kept session goes with it.
  const startsAt = Date.parse(data.startsAt || "");
  const termsUrl = httpsUrl(data.termsUrl);
  const privacyUrl = httpsUrl(data.privacyUrl);
  const appUrl = httpsUrl(data.appStoreUrl);
  const byId = (id) => document.getElementById(id);
  const sections = { invite: byId("step-invitation"), confirm: byId("step-confirm"), code: byId("step-code"), answer: byId("step-answer"), done: byId("step-app") };
  if (Object.values(sections).some((el) => !el)) return;

  // ---- Screen 1, as the server drew it: the host's initial in the avatar, and what the answer step repeats. ----
  const dot = sections.invite.querySelector(".dot");
  // Drawn by CSS from the attribute, so the line's text stays "<host> invited you".
  if (dot) dot.dataset.initial = (Array.from(host.trim())[0] || "").toUpperCase();
  const title = sections.invite.querySelector("h1")?.textContent ?? "";
  const heroSrc = sections.invite.querySelector(".hero")?.getAttribute("src") ?? "";
  // The detail lines are the time, the area when there is one, and the going count (last).
  const basics = Array.from(sections.invite.querySelectorAll(".detail"), (p) => p.textContent.trim())
    .slice(0, -1)
    .filter(Boolean)
    .join(" · ");

  // ---- Confirm it's you: the tick, the terms, the number. ----
  const confirmHeading = h("h1", { tabindex: "-1", text: C.confirmHeading });
  const tick = h("input", { type: "checkbox", id: "tick", "aria-describedby": "terms-line", onchange: () => dispatch({ type: "tick", ticked: tick.checked }) });
  const terms = h("p", { id: "terms-line", class: "terms" });
  for (const part of C.terms.split(/(Terms|Privacy Policy)/)) {
    const url = part === "Terms" ? termsUrl : part === "Privacy Policy" ? privacyUrl : "";
    terms.append(url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: part }) : part);
  }
  const ageHelper = h("p", { id: "age-helper", class: "helper", text: C.ageHelper });
  const number = h("input", { id: "number", type: "tel", inputmode: "tel", autocomplete: "tel", "aria-describedby": open ? "number-hint confirm-error" : "confirm-error" });
  const numberHint = open ? h("p", { id: "number-hint", class: "muted", text: C.outsideUk }) : null;
  const confirmError = h("p", { id: "confirm-error", class: "error" });
  const sendButton = h("button", { type: "submit", class: "button", text: C.send });
  const confirmForm = h(
    "form",
    { novalidate: true, onsubmit: onSend },
    h("div", { class: "agree" }, h("div", { class: "tick" }, tick, h("label", { for: "tick", text: C.tick })), terms, ageHelper),
    h("div", { class: "field" }, h("label", { for: "number", text: C.numberField }), number),
    numberHint,
    confirmError,
    sendButton,
  );
  sections.confirm.append(confirmHeading, h("p", { class: "lead", text: open ? C.numberHint : C.confirmBody(host) }), confirmForm);

  // ---- The code. ----
  const codeHeading = h("h1", { tabindex: "-1", text: C.codeHeading });
  const codeBody = h("p", { class: "lead" });
  const codeInput = h("input", { id: "code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", "aria-describedby": "code-error" });
  const codeError = h("p", { id: "code-error", class: "error" });
  // The countdown changes every second; it is not announced.
  const resendLine = h("p", { class: "muted", "aria-live": "off" });
  const resendButton = h("button", { type: "button", class: "link", text: C.resend, onclick: onResend });
  const verifyButton = h("button", { type: "submit", class: "button", text: C.verify });
  const codeForm = h(
    "form",
    { novalidate: true, onsubmit: onVerify },
    h("div", { class: "field" }, h("label", { for: "code", text: C.codeField }), codeInput),
    codeError,
    resendLine,
    resendButton,
    verifyButton,
  );
  const changeNumber = h("button", { type: "button", class: "link", text: C.changeNumber, onclick: () => dispatch({ type: "back" }) });
  sections.code.append(codeHeading, h("p", { class: "chip", text: C.codeSent }), codeBody, codeForm, changeNumber);

  // ---- The answer. ----
  const answerHeading = h("h1", { tabindex: "-1", text: title });
  // Not you? On a shared computer the next person can end the session kept here.
  const signOutButton = () => h("button", { type: "button", class: "link signout", text: C.signOut, onclick: onSignOut });
  const nameInput = h("input", { id: "name", autocomplete: "given-name", maxlength: "80", "aria-describedby": "answer-error" });
  const nameField = h("div", { class: "field" }, h("label", { for: "name", text: C.nameField }), nameInput);
  const labels = { accepted: C.going, maybe: C.maybe, declined: C.cantGo };
  const radios = RESPONSES.map((value) =>
    h("input", { type: "radio", name: "response", value, onchange: () => dispatch({ type: "choose", response: value }) }),
  );
  const answerError = h("p", { id: "answer-error", class: "error" });
  const answerForm = h(
    "form",
    { novalidate: true, onsubmit: onAnswer },
    nameField,
    h(
      "fieldset",
      { class: "seg", "aria-describedby": "answer-error" },
      h("legend", { class: "visually-hidden", text: C.answerLegend }),
      radios.map((radio) => h("label", {}, radio, h("span", { text: labels[radio.value] }))),
    ),
    answerError,
    h("button", { type: "submit", class: "button", text: C.sendAnswer }),
  );
  // The open link has no ending on the page: the chip shows the verified number's.
  const verifiedChip = h("p", { class: "chip", text: C.verified(ending) });
  sections.answer.append(
    answerHeading,
    verifiedChip,
    heroSrc ? h("img", { class: "hero small", src: heroSrc, alt: "" }) : null,
    basics ? h("p", { class: "muted", text: basics }) : null,
    answerForm,
    h("p", { class: "muted center", text: C.hostSees(host) }),
    signOutButton(),
  );

  // ---- Get the app: direction A after Going or Maybe, the softer screen after Can't go. ----
  const okMark = h("p", { class: "big-ok", "aria-hidden": "true", text: "✓" });
  const doneHeading = h("h1", { tabindex: "-1", class: "center" });
  const doneHost = h("p", { class: "muted center" });
  // Small aqua icons, drawn by CSS so each item's text is just its words.
  const icons = ["⟳", "☺", "⌖", "◷", "▦"];
  const waitingLine = h("p", { class: "muted center" });
  const pitch = h(
    "div",
    { class: "pitch" },
    h("ul", { class: "benefits" }, C.benefits.map((benefit, i) => h("li", {}, h("span", { class: "ic", "aria-hidden": "true", "data-icon": icons[i] }), benefit))),
    appUrl ? h("a", { class: "button dark", href: appUrl, text: C.getApp }) : null,
    waitingLine,
    h("button", { type: "button", class: "link", text: C.notNow, onclick: () => dispatch({ type: "notNow" }) }),
  );
  const soft = h(
    "div",
    { class: "soft" },
    h("p", { class: "muted center", text: C.planOwn }),
    appUrl ? h("a", { class: "button small", href: appUrl, text: C.getApp }) : null,
  );
  const changeButton = h("button", { type: "button", class: "link", text: C.changeAnswer, onclick: () => dispatch({ type: "change" }) });
  // The open link only: declined, with nothing but a way to plan one's own; already on it, into the app on this link.
  const planOwnLine = open ? h("p", { class: "muted center plan-own" }, appUrl ? h("a", { href: appUrl, text: C.planOwn }) : C.planOwn) : null;
  const inApp = open
    ? h(
        "div",
        { class: "in-app" },
        h("a", { class: "button", href: `resbite://r/${encodeURIComponent(code)}`, text: C.openApp }),
        appUrl ? h("a", { class: "button small", href: appUrl, text: C.getApp }) : null,
      )
    : null;
  sections.done.append(okMark, doneHeading, doneHost, changeButton, pitch, soft, planOwnLine, inApp, signOutButton());
  // Sign out comes back to the invitation, so its heading can take focus too.
  sections.invite.querySelector("h1")?.setAttribute("tabindex", "-1");
  const headings = { invite: sections.invite.querySelector("h1"), confirm: confirmHeading, code: codeHeading, answer: answerHeading, done: doneHeading };

  // ---- State, drawing and focus. ----
  let state = initialState();
  let timer = null;
  function dispatch(event) {
    const before = state;
    state = next(state, event);
    if (state !== before) render(before, event);
  }
  /** Dispatches an event that starts a request; true when this call started it. */
  function begin(event) {
    const wasBusy = state.busy;
    dispatch(event);
    return !wasBusy && state.busy;
  }

  function render(before, event) {
    const s = state;
    for (const [step, el] of Object.entries(sections)) el.hidden = step !== s.step;
    // Requests in flight: the forms say so and their buttons do nothing until the reply.
    for (const form of [confirmForm, codeForm, answerForm]) form.setAttribute("aria-busy", String(s.busy));
    for (const button of main.querySelectorAll("form .button, form .link, .signout")) {
      if (s.busy) button.setAttribute("aria-disabled", "true");
      else button.removeAttribute("aria-disabled");
    }

    const error = errorText(s.error, host);
    tick.checked = s.ticked;
    ageHelper.hidden = s.ticked;
    sendButton.disabled = !s.ticked;
    if (s.ticked) sendButton.removeAttribute("aria-describedby");
    else sendButton.setAttribute("aria-describedby", "age-helper");
    // The age helper is already on screen while unticked; it isn't repeated as an error.
    setError(confirmError, s.step === "confirm" && s.error !== "ageHelper" ? error : "", number, ["invalidNumber", "wrongNumber"].includes(s.error));

    codeBody.textContent = C.codeBody(s.number);
    setError(codeError, s.step === "code" ? error : "", codeInput, ["mismatch", "expired"].includes(s.error));
    if (s.step === "code" && !timer) timer = setInterval(countdown, 1000);
    if (s.step !== "code" && timer) timer = (clearInterval(timer), null);
    countdown();

    nameField.hidden = !needsName(s);
    if (open) verifiedChip.textContent = C.verified(endingOf(s.phone));
    for (const radio of radios) radio.checked = radio.value === s.choice;
    setError(answerError, s.step === "answer" ? error : "", nameInput, s.error === "nameRule");

    if (open) drawJoin(s);
    else {
      const declined = s.response === "declined";
      okMark.hidden = declined;
      doneHeading.textContent = declined ? C.cantHeading : s.response === "maybe" ? C.maybeHeading : C.goingHeading;
      doneHost.textContent = declined ? C.hostSees(host) : C.hostCanSee(host);
      pitch.hidden = declined || !s.pitch;
      soft.hidden = !declined;
      const masked = maskNumber(s.phone, country);
      waitingLine.textContent = masked ? C.waiting(masked) : "";
      waitingLine.hidden = !masked;
    }

    // Each new step starts at its heading; so does Not now, whose button goes away. Restoring on load follows no
    // action, so it leaves focus where the browser put it.
    if (event.type !== "restore" && (s.step !== before.step || (before.pitch && !s.pitch))) headings[s.step]?.focus();
  }

  /**
   * The open link's last step. Waiting: the host's line, the get-the-app block and Change answer (the page's 44 need
   * not be the number's country, so no "Sign up with +44 ••• 834"). Not added: only Plan your own. Already in: Open
   * Resbite and Get Resbite.
   */
  function drawJoin(s) {
    const waiting = s.join === "waiting";
    okMark.hidden = s.join === "notAdded";
    doneHeading.textContent = waiting ? C.waitingHeading(host) : s.join === "alreadyIn" ? C.alreadyIn : s.join === "notAdded" ? C.notAdded : "";
    doneHost.textContent = waiting ? C.waitingBody(host) : "";
    doneHost.hidden = !waiting;
    changeButton.hidden = !waiting;
    pitch.hidden = !waiting || !s.pitch;
    waitingLine.hidden = true;
    soft.hidden = true;
    planOwnLine.hidden = s.join !== "notAdded";
    inApp.hidden = s.join !== "alreadyIn";
  }

  function setError(el, text, input, invalid) {
    el.textContent = text;
    el.hidden = !text;
    if (text && invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function countdown() {
    const left = state.sentAt == null ? 0 : Math.ceil((state.sentAt + RESEND_DELAY_MS - Date.now()) / 1000);
    resendLine.hidden = left <= 0;
    resendLine.textContent = left > 0 ? C.resendIn(left) : "";
    resendButton.hidden = left > 0;
  }

  // ---- Supabase: Auth and REST with the publishable key; the access token once signed in. ----
  // One entry per invitation code: the session and the full number this page verified for that code. Entries whose
  // event has started go, whatever their code; this one goes too once its event starts.
  const storage = pageStorage();
  sweepKept(storage, Date.now());
  if (Number.isFinite(startsAt) && startsAt <= Date.now()) dropKept(storage, code);
  const kept = readKept(storage, code, Date.now());
  let session = kept?.session ?? null;
  let verifiedPhone = kept?.phone ?? null;
  function keep(value) {
    session = value;
    // Not kept when storage refuses: this visit still works; the next one asks for the code again.
    writeKept(storage, code, keptEntry(value, verifiedPhone, startsAt));
  }
  function forget() {
    session = null;
    verifiedPhone = null;
    dropKept(storage, code);
  }

  /** POST to Supabase. A lost connection is status 0. */
  async function api(path, body, token) {
    const headers = { apikey: key, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      let json = null;
      try {
        json = await response.json();
      } catch {
        // An empty or non-JSON body.
      }
      return { ok: response.ok, status: response.status, body: json };
    } catch {
      return { ok: false, status: 0, body: null };
    }
  }

  /** The kept session, refreshed first when it has expired. `error` is "connection" or "signedOut" without one. */
  async function freshSession() {
    if (!session) return { error: "signedOut" };
    if (!sessionExpired(session, Date.now())) return { session };
    const reply = await api("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    const renewed = reply.ok ? sessionFrom(reply.body, Date.now(), session.phone) : null;
    if (renewed) {
      keep(renewed);
      return { session: renewed };
    }
    if (reply.status === 0 || reply.status >= 500) return { error: "connection" };
    forget();
    return { error: "signedOut" };
  }

  async function onSend(event) {
    event.preventDefault();
    if (!begin({ type: "send", input: number.value, country })) return;
    const phone = state.phone;
    // The open link takes any number: the code goes straight to it.
    if (!open) {
      const check = await api("/rest/v1/rpc/check_invited_number", { p_code: code, p_phone: phone });
      if (!check.ok) return dispatch({ type: "fail", error: rpcError(check.status, check.body) === "tooMany" ? "tooMany" : "connection" });
      dispatch({ type: "checked", matches: check.body === true });
    }
    if (state.busy) await sendCode(phone);
  }

  async function sendCode(phone) {
    const reply = await api("/auth/v1/otp", { phone, create_user: true });
    dispatch(reply.ok ? { type: "sent", at: Date.now() } : { type: "fail", error: sendError(reply.status, reply.body) });
  }

  async function onResend() {
    if (!begin({ type: "resend" })) return;
    await sendCode(state.phone);
    codeInput.focus();
  }

  async function onVerify(event) {
    event.preventDefault();
    if (!begin({ type: "verify", code: codeInput.value })) {
      if (state.error === "mismatch" && !state.busy) codeInput.value = "";
      return;
    }
    const phone = state.phone;
    let token = state.code;
    // Test mode: the server swaps the test code for the one it stored, or returns null (then it is checked as typed).
    if (isTestCode(token)) {
      const swap = await api("/rest/v1/rpc/exchange_test_code", { p_phone: phone, p_code: token });
      if (!swap.ok) return dispatch({ type: "fail", error: "connection" });
      if (typeof swap.body === "string" && swap.body) token = swap.body;
    }
    const reply = await api("/auth/v1/verify", { type: "sms", phone, token });
    const signedIn = reply.ok ? sessionFrom(reply.body, Date.now(), phone) : null;
    if (signedIn) {
      // The number check passed for this code before the code was sent, so this is the number to restore for it.
      verifiedPhone = phone;
      keep(signedIn);
      codeInput.value = "";
      return dispatch({ type: "verified" });
    }
    const error = reply.ok ? "connection" : verifyError(reply.status, reply.body, state.sentAt, Date.now());
    if (error === "mismatch" || error === "expired") codeInput.value = "";
    dispatch({ type: "fail", error });
  }

  async function onAnswer(event) {
    event.preventDefault();
    if (!begin({ type: "submit", name: nameInput.value })) return;
    const fresh = await freshSession();
    if (!fresh.session) return dispatch(fresh.error === "connection" ? { type: "fail", error: "connection" } : { type: "refused", error: null });
    const reply = await api(
      open ? "/rest/v1/rpc/request_to_join" : "/rest/v1/rpc/answer_phone_invitation",
      { p_code: code, p_name: state.name, p_response: state.choice, p_terms_version: termsVersion },
      fresh.session.access_token,
    );
    if (reply.ok && open) {
      // Waiting for the host, declined on this link, or already on it: the server's reply picks the screen.
      const screen = screenForRequest(reply.body);
      return dispatch(screen ? { type: "answered", ...screen } : { type: "fail", error: "connection" });
    }
    if (reply.ok) return dispatch({ type: "answered", response: RESPONSES.includes(reply.body?.response) ? reply.body.response : state.choice });
    const error = rpcError(reply.status, reply.body);
    // Signed in with another number, or no longer signed in: confirm the number again.
    if (error === "wrongNumber" || error === "signedOut") {
      forget();
      return dispatch({ type: "refused", error: error === "wrongNumber" ? "wrongNumber" : null });
    }
    dispatch({ type: "fail", error });
  }

  /** Not you? The session goes from this browser at once and from GoTrue after; the page starts again. */
  async function onSignOut() {
    if (state.busy) return;
    const done = signOutKept({ storage, code, session, post: api });
    session = null;
    verifiedPhone = null;
    for (const input of [number, codeInput, nameInput]) input.value = "";
    dispatch({ type: "signOut" });
    await done;
  }

  answerButton.addEventListener("click", () => dispatch({ type: "open" }));

  // Coming back on the same browser: the kept session for this code shows the answer (or the answer step, verified but
  // not yet answered), but only while it holds exactly the number verified here for this code. Anything else is
  // dropped, and the page starts at the invitation. The open link has no invited number to match; its kept number is
  // simply the one verified here, and my_join_request picks the screen.
  async function restore() {
    if (!session) return;
    answerButton.disabled = true;
    main.setAttribute("aria-busy", "true");
    try {
      const fresh = await freshSession();
      if (!fresh.session) return;
      if (!sameNumber(fresh.session, { phone: verifiedPhone })) return forget();
      const reply = await api(open ? "/rest/v1/rpc/my_join_request" : "/rest/v1/rpc/my_phone_invitation", { p_code: code }, fresh.session.access_token);
      if (reply.status === 401) return forget();
      if (!reply.ok || reply.body?.state !== "open") return;
      if (open) return dispatch({ type: "restore", ...screenForReturn(reply.body), phone: fresh.session.phone });
      const response = RESPONSES.includes(reply.body.response) ? reply.body.response : null;
      dispatch({ type: "restore", response, phone: fresh.session.phone });
    } finally {
      answerButton.disabled = false;
      main.removeAttribute("aria-busy");
    }
  }
  restore();
}

const main = document.getElementById("main");
const answerButton = document.getElementById("answer");
if (main && answerButton) start(main, answerButton);
