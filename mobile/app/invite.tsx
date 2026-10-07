import { Check, X, MessageCircle, Undo2 } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAccount } from "../src/state/AccountState";
import { useApp } from "../src/state/AppState";
import {
  Back,
  Button,
  ActionRow,
  TextAction,
  ActionGroup,
  Copy,
  Title,
  ErrorNote,
  s,
} from "../src/design/ui";
import {
  canReadSample,
  canRespond,
  reconcileRsvp,
  type Response,
  type RsvpAttempt,
  type RsvpSnapshot,
} from "../src/domain/rsvp";
import { EventPictureView } from "../src/design/categories";
import { eventPicture } from "../src/domain/events";
import { claimInvitation, readRsvp, writeRsvp } from "../src/services/rsvp";
export default function Invite() {
  const { token, plan } = useLocalSearchParams<{
    token?: string;
    plan?: string;
  }>();
  const {
    session,
    restoring,
    preview,
    rememberInvite,
    captureSession,
    signingOut,
  } = useApp();
  const account = useAccount();
  const accountReady =
    account.status === "approved" && account.reviewed && account.profileReady;
  const userId = session?.user.id;
  const identity = `${userId}:${token}:${plan}:${preview}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const focused = useRef(false),
    generation = useRef(0),
    working = useRef(false);
  const resolved = useRef<{ identity: string; id: string } | null>(null);
  const [snapshot, setSnapshot] = useState<RsvpSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [fresh, setFresh] = useState(false);
  const [pending, setPending] = useState<RsvpAttempt | null>(null);
  const remember = useRef(rememberInvite);
  remember.current = rememberInvite;
  const retained = useRef<{ identity: string; promise: Promise<void> } | null>(
    null,
  );
  function retainToken() {
    if (retained.current?.identity === identity)
      return retained.current.promise;
    const promise =
      currentIdentity.current === identity
        ? remember.current(token!)
        : Promise.resolve();
    retained.current = { identity, promise };
    void promise.catch(() => {
      if (retained.current?.promise === promise) retained.current = null;
    });
    return promise;
  }
  useEffect(() => {
    setSnapshot(null);
    setPending(null);
    setNotice(null);
    setError(null);
    setFresh(false);
    working.current = false;
    if (signingOut) {
      retained.current = null;
      return;
    }
    if (!preview && token && /^[a-f0-9]{64}$/.test(token))
      void retainToken().catch(() => {
        if (currentIdentity.current === identity)
          setError(
            "We could not keep this invitation on this device. Keep the original link.",
          );
      });
  }, [identity, token, signingOut]);
  useEffect(() => {
    if (
      !session ||
      preview ||
      signingOut ||
      accountReady ||
      account.status === "checking"
    )
      return;
    let active = true;
    const preserve =
      token && /^[a-f0-9]{64}$/.test(token) ? retainToken() : Promise.resolve();
    void preserve
      .then(() => {
        if (active) router.replace("/account");
      })
      .catch(() => {
        if (active)
          setError(
            "We could not keep this invitation. Keep the original link and try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [identity, accountReady, account.status, signingOut]);
  const load = useCallback(async () => {
    if (!userId || preview || signingOut || working.current || !accountReady)
      return;
    const assertSession = captureSession();
    const run = ++generation.current;
    const valid = () => {
      try {
        assertSession();
      } catch {
        return false;
      }
      return (
        focused.current &&
        currentIdentity.current === identity &&
        generation.current === run
      );
    };
    setBusy(true);
    setFresh(false);
    setError(null);
    try {
      if (token) {
        if (!/^[a-f0-9]{64}$/.test(token))
          throw new Error("This invitation link is incomplete.");
        await retainToken();
        if (!valid()) return;
      }
      let id =
        resolved.current?.identity === identity
          ? resolved.current.id
          : token
            ? undefined
            : plan;
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
      if (!id)
        throw new Error(
          "Invitation unavailable. Open the original invitation link.",
        );
      const next = await readRsvp(id, userId);
      if (valid()) {
        setSnapshot(next);
        setFresh(true);
      }
    } catch (e) {
      if (valid()) {
        setSnapshot(null);
        setError(e instanceof Error ? e.message : "Invitation unavailable.");
      }
    } finally {
      if (valid()) setBusy(false);
    }
  }, [
    identity,
    plan,
    token,
    userId,
    preview,
    signingOut,
    captureSession,
    accountReady,
  ]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
        else {
          setFresh(false);
          ++generation.current;
        }
      });
      return () => {
        focused.current = false;
        ++generation.current;
        sub.remove();
      };
    }, [load]),
  );
  async function respond(value: Response, retry?: RsvpAttempt) {
    if (
      !snapshot ||
      !userId ||
      preview ||
      !accountReady ||
      working.current ||
      !focused.current
    )
      return;
    working.current = true;
    const assertSession = captureSession();
    const operation = ++generation.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    setFresh(false);
    const valid = () => {
      try {
        assertSession();
      } catch {
        return false;
      }
      return (
        focused.current &&
        currentIdentity.current === identity &&
        generation.current === operation
      );
    };
    const attempt = retry ?? {
      planId: snapshot.plan.id,
      planVersion: snapshot.plan.version,
      version: snapshot.attendee.version,
      response: value,
    };
    setPending(attempt);
    try {
      let next = await readRsvp(attempt.planId, userId);
      if (!valid()) return;
      const decision = reconcileRsvp(attempt, next);
      if (decision === "retry") {
        try {
          assertSession();
          await writeRsvp(attempt);
        } catch {
          /* Confirm saved state before offering an identical retry. */
        }
        if (!valid()) return;
        next = await readRsvp(attempt.planId, userId);
        if (!valid()) return;
      }
      setSnapshot(next);
      setFresh(true);
      const result = reconcileRsvp(attempt, next);
      if (result === "confirmed") {
        setPending(null);
        setNotice("Your response is saved.");
      } else if (result === "review" || result === "unavailable") {
        setPending(null);
        setError(
          result === "review"
            ? "The plan or your response changed. Review the latest details before choosing again."
            : "This plan is cancelled or has already started. Responses are closed.",
        );
      } else
        setError(
          "Your response is not confirmed. Retry checks the saved response before trying the same choice again.",
        );
    } catch {
      if (valid())
        setError(
          "We could not confirm your response. Check your connection, then retry.",
        );
    } finally {
      if (currentIdentity.current === identity) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  const allowed = snapshot && canRespond(snapshot);
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <Back />
        <Title>You’re invited.</Title>
        {!session && !restoring && (
          <>
            <Copy>
              Sign in with your tester account. We’ll keep this invitation ready
              while you finish setting up.
            </Copy>
            <Button title="Sign in" onPress={() => router.push("/auth")} />
          </>
        )}
        {preview && (
          <Copy>Preview cannot claim invitations or send an RSVP.</Copy>
        )}
        <ErrorNote message={error} />
        {notice && <Copy accessibilityLiveRegion="polite">{notice}</Copy>}
        {session && !preview && (
          <Button
            title="Refresh invitation"
            secondary
            loading={busy}
            onPress={() => void load()}
          />
        )}
        {snapshot && (
          <>
            <EventPictureView picture={eventPicture(snapshot.plan)} size={70} />
            <Title style={{ fontSize: 24 }}>{snapshot.plan.title}</Title>
            {!!snapshot.plan.description && (
              <Copy>{snapshot.plan.description}</Copy>
            )}
            <Copy>{new Date(snapshot.plan.starts_at).toLocaleString()}</Copy>
            <Copy>{snapshot.plan.place_label}</Copy>
            {!!snapshot.plan.note && <Copy>{snapshot.plan.note}</Copy>}
            <Copy>Your response: {snapshot.attendee.response}</Copy>
            {!allowed && (
              <Copy>
                This plan is cancelled or has already started. Responses are
                closed.
              </Copy>
            )}
            {pending ? (
              <Button
                title="Retry my response"
                loading={busy}
                onPress={() => void respond(pending.response, pending)}
              />
            ) : (
              allowed && (
                <>
                  <ActionGroup>
                    <ActionRow
                      icon={Check}
                      title="I’ll be there"
                      disabled={busy || !fresh}
                      onPress={() => void respond("accepted")}
                    />
                    <ActionRow
                      icon={X}
                      tone="rose"
                      title="Can’t make it"
                      disabled={busy || !fresh}
                      onPress={() => void respond("declined")}
                    />
                  </ActionGroup>
                  {snapshot.attendee.response === "accepted" && (
                    <TextAction
                      icon={Undo2}
                      title="Withdraw my RSVP"
                      disabled={busy || !fresh}
                      onPress={() => void respond("withdrawn")}
                    />
                  )}
                </>
              )
            )}
            {fresh && !pending && canReadSample(snapshot) && (
              <ActionRow
                icon={MessageCircle}
                tone="violet"
                title="View sample conversation"
                disabled={busy}
                onPress={() =>
                  router.push({
                    pathname: "/sample-chat",
                    params: { plan: snapshot.plan.id },
                  })
                }
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
