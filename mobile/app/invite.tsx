import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAccount } from "../src/state/AccountState";
import { useApp } from "../src/state/AppState";
import { useFocusedRefresh, type Run } from "../src/state/useFocusedRefresh";
import { useGuestAccount } from "../src/state/useGuestAccount";
import { Back, Button, Copy, Title, ErrorNote, s } from "../src/design/ui";
import { GuestScreen } from "../src/design/GuestSteps";
import { colors as c } from "../src/design/tokens";
import { claimInvitation } from "../src/services/rsvp";
import { joinRequestGateway } from "../src/services/joinRequests";
import { isInviteToken, isLinkCode } from "../src/domain/appLinks";
import { accountGate } from "../src/domain/accountRoute";
import { incompleteInvitation, isClaimRefusal } from "../src/domain/eventLinks";
import { GUEST_COPY, nameFromSession } from "../src/domain/guestAccount";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { joinDestination, joinRefusedForGood } from "../src/domain/joinView";
import { phoneVerified } from "../src/domain/phone";

type Target = { pathname: "/event" | "/waiting"; params: { plan: string } };

/**
 * Opens an invitation link, then replaces itself with where it leads. A per-person link brings a `token`; the
 * event's one link (GI1, /r/<code>) brings a `code`. Either is kept on the device until it is used, or until it
 * is refused for good (turned off, started, cancelled, malformed): only a lost connection keeps it for a retry.
 * "Go to My resbites" leaves the error and drops it too.
 *
 * Plan 3: an event link no longer lets anyone in by itself. Signed out it shows the invitation with Sign up to
 * reply and I have an account (useGuestAccount, GuestScreen). Signed in, approved or still waiting for access,
 * once the phone gate is clear (accountGate, run by /account first) it sends a request (request_to_join,
 * "pending"): the owner and existing guests land on the event, anyone else on /waiting. A per-person link keeps
 * GI1's claim for approved accounts.
 */
export default function Invite() {
  const { token, code, plan } = useLocalSearchParams<{
    token?: string;
    code?: string;
    plan?: string;
  }>();
  // What was opened (a token wins over a code), and that value when it is well formed.
  const secret = token ?? code;
  const keep = token ? (isInviteToken(token) ? token : null) : isLinkCode(code) ? code : null;
  const { session, restoring, preview, rememberInvite, signingOut } = useApp();
  const account = useAccount();
  const approved = account.status === "approved" && account.reviewed;
  const accountReady = approved && account.profileReady;
  // The name the gate made sure of (About you). An account still waiting for access has no profile row yet,
  // so the request carries it; with a profile the server keeps the profile's.
  const name = nameFromSession(account.user, null);
  const gateClear =
    account.status === "access_pending" &&
    accountGate({
      status: account.status,
      phoneVerified: phoneVerified(account.user),
      name,
      profileReady: account.profileReady,
    }) === null;
  const ready = accountReady || (!token && gateClear);
  const guest = useGuestAccount({ code, token });
  const userId = session?.user.id;
  const identity = `${userId}:${token}:${code}:${plan}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const resolved = useRef<{ identity: string; target: Target } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The event page needs approved access. An owner or guest whose account still reads as waiting has likely
  // been let in since: the account is read again, then the event opens, or /account when it still waits.
  const [handoff, setHandoff] = useState<{ plan: string; read: boolean } | null>(null);
  const handingOff = useRef(false);
  const remember = useRef(rememberInvite);
  remember.current = rememberInvite;
  const retained = useRef<{ identity: string; promise: Promise<void> } | null>(null);
  function retainToken() {
    if (retained.current?.identity === identity) return retained.current.promise;
    const promise = currentIdentity.current === identity ? remember.current(keep!) : Promise.resolve();
    retained.current = { identity, promise };
    void promise.catch(() => {
      if (retained.current?.promise === promise) retained.current = null;
    });
    return promise;
  }
  useEffect(() => {
    setError(null);
    if (signingOut) {
      retained.current = null;
      return;
    }
    if (!preview && keep)
      void retainToken().catch(() => {
        if (currentIdentity.current === identity)
          setError("We could not keep this invitation on this device. Keep the original link.");
      });
  }, [identity, keep, signingOut]);
  useEffect(() => {
    if (!session || preview || signingOut || ready || account.status === "checking" || handingOff.current) return;
    let active = true;
    const preserve = keep ? retainToken() : Promise.resolve();
    void preserve
      .then(() => {
        if (active) router.replace("/account");
      })
      .catch(() => {
        if (active) setError("We could not keep this invitation. Keep the original link and try again.");
      });
    return () => {
      active = false;
    };
  }, [identity, ready, account.status, signingOut]);
  useEffect(() => {
    if (!handoff?.read) return;
    if (approved) router.replace({ pathname: "/event", params: { plan: handoff.plan } });
    else router.replace("/account");
  }, [handoff, approved]);
  const claim = useCallback(
    async (begin: () => Run) => {
      if (!userId || preview || signingOut || !ready || handingOff.current) return;
      const { valid, assertSession } = begin();
      setBusy(true);
      setError(null);
      // Set when the server refused the request (not a lost connection): only that drops a kept event link.
      let refused = false;
      try {
        if (secret) {
          if (!keep) throw new Error(incompleteInvitation);
          await retainToken();
          if (!valid()) return;
        }
        let target: Target | undefined =
          resolved.current?.identity === identity
            ? resolved.current.target
            : !secret && plan
              ? { pathname: "/event", params: { plan } }
              : undefined;
        if (!target && keep) {
          assertSession();
          target = token
            ? { pathname: "/event", params: { plan: await claimInvitation(keep) } }
            : joinDestination(
                await joinRequestGateway.request(keep, "pending", name ?? undefined).catch((e: unknown) => {
                  refused = joinRefusedForGood(e instanceof Error ? e.message : INVITE_COPY.offline);
                  throw e;
                }),
              );
          if (!valid()) return;
          resolved.current = { identity, target };
        }
        if (keep && target) {
          if (valid()) await remember.current(null, keep);
          if (!valid()) return;
        }
        if (!target) throw new Error("Invitation unavailable. Open the original invitation link.");
        if (target.pathname === "/event" && !approved) {
          const id = target.params.plan;
          handingOff.current = true;
          setHandoff({ plan: id, read: false });
          void account.refresh().then(() => setHandoff((h) => (h?.plan === id ? { plan: id, read: true } : h)));
          return;
        }
        // The claim lands straight on the answer (benchmark row 9); a request on its waiting screen.
        router.replace(target);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invitation unavailable.";
        // A refusal for good drops the kept link (a malformed one was never kept), so a restart opens the app
        // as usual instead of this error. The message still shows.
        const final = token ? isClaimRefusal(message) : refused;
        if (keep && final && valid()) await remember.current(null, keep).catch(() => {});
        if (valid()) setError(message);
      } finally {
        if (valid()) setBusy(false);
      }
    },
    [identity, plan, token, code, userId, preview, signingOut, ready, approved, name],
  );
  const { refresh } = useFocusedRefresh(claim, { identity });
  // The way out of an error: the kept link (if it is this one) is dropped, then My resbites, or the account's
  // access screen while it still waits for access.
  async function leave() {
    if (keep) await remember.current(null, keep).catch(() => {});
    router.replace(accountReady ? "/plans" : "/account");
  }
  if (guest.active) return <GuestScreen guest={guest} notice={error} />;
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <Back />
        <Title>{INVITE_COPY.invitedHeading}</Title>
        {!session && !restoring && (
          <>
            <Copy>{INVITE_COPY.keptNote}</Copy>
            <Button title="Sign in" onPress={() => router.push("/auth")} />
          </>
        )}
        {preview && <Copy>Preview cannot claim invitations or send an RSVP.</Copy>}
        <ErrorNote message={error} />
        {(busy || handoff || (session && account.status === "checking")) && (
          <ActivityIndicator accessibilityLabel="Opening your invitation" color={c.aquaDark} />
        )}
        {session && !preview && (
          <Button title="Refresh invitation" secondary loading={busy} onPress={() => void refresh()} />
        )}
        {!!error && session && !preview && ready && (
          <Button
            title={accountReady ? "Go to My resbites" : GUEST_COPY.goHome}
            secondary
            onPress={() => void leave()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
