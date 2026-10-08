import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAccount } from "../src/state/AccountState";
import { useApp } from "../src/state/AppState";
import { useFocusedRefresh, type Run } from "../src/state/useFocusedRefresh";
import { Back, Button, Copy, Title, ErrorNote, s } from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
import { claimInvitation } from "../src/services/rsvp";

/** Claims an invitation link, then replaces itself with the event page's answer. */
export default function Invite() {
  const { token, plan } = useLocalSearchParams<{
    token?: string;
    plan?: string;
  }>();
  const { session, restoring, preview, rememberInvite, signingOut } = useApp();
  const account = useAccount();
  const accountReady = account.status === "approved" && account.reviewed && account.profileReady;
  const userId = session?.user.id;
  const identity = `${userId}:${token}:${plan}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const resolved = useRef<{ identity: string; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remember = useRef(rememberInvite);
  remember.current = rememberInvite;
  const retained = useRef<{ identity: string; promise: Promise<void> } | null>(null);
  function retainToken() {
    if (retained.current?.identity === identity) return retained.current.promise;
    const promise = currentIdentity.current === identity ? remember.current(token!) : Promise.resolve();
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
    if (!preview && token && /^[a-f0-9]{64}$/.test(token))
      void retainToken().catch(() => {
        if (currentIdentity.current === identity)
          setError("We could not keep this invitation on this device. Keep the original link.");
      });
  }, [identity, token, signingOut]);
  useEffect(() => {
    if (!session || preview || signingOut || accountReady || account.status === "checking") return;
    let active = true;
    const preserve = token && /^[a-f0-9]{64}$/.test(token) ? retainToken() : Promise.resolve();
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
  }, [identity, accountReady, account.status, signingOut]);
  const claim = useCallback(
    async (begin: () => Run) => {
      if (!userId || preview || signingOut || !accountReady) return;
      const { valid, assertSession } = begin();
      setBusy(true);
      setError(null);
      try {
        if (token) {
          if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("This invitation link is incomplete.");
          await retainToken();
          if (!valid()) return;
        }
        let id = resolved.current?.identity === identity ? resolved.current.id : token ? undefined : plan;
        if (!id && token) {
          assertSession();
          id = await claimInvitation(token);
          if (!valid()) return;
          resolved.current = { identity, id };
        }
        if (token && id) {
          if (valid()) await remember.current(null, token);
          if (!valid()) return;
        }
        if (!id) throw new Error("Invitation unavailable. Open the original invitation link.");
        // The claim lands straight on the answer (benchmark row 9).
        router.replace({ pathname: "/event", params: { plan: id } });
      } catch (e) {
        if (valid()) setError(e instanceof Error ? e.message : "Invitation unavailable.");
      } finally {
        if (valid()) setBusy(false);
      }
    },
    [identity, plan, token, userId, preview, signingOut, accountReady],
  );
  const { refresh } = useFocusedRefresh(claim, { identity });
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <Back />
        <Title>You’re invited.</Title>
        {!session && !restoring && (
          <>
            <Copy>
              Sign in with your tester account. We’ll keep this invitation ready while you finish setting up.
            </Copy>
            <Button title="Sign in" onPress={() => router.push("/auth")} />
          </>
        )}
        {preview && <Copy>Preview cannot claim invitations or send an RSVP.</Copy>}
        <ErrorNote message={error} />
        {busy && <ActivityIndicator accessibilityLabel="Opening your invitation" color={c.aquaDark} />}
        {session && !preview && (
          <Button title="Refresh invitation" secondary loading={busy} onPress={() => void refresh()} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
