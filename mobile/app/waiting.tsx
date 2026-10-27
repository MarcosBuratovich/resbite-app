import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Button, Copy, ErrorNote, Title, s } from "../src/design/ui";
import { Segmented } from "../src/design/kit";
import { LinkCard } from "../src/design/GuestSteps";
import { NotificationAsk } from "../src/design/NotificationAsk";
import { colors as c } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
import { useAccount } from "../src/state/AccountState";
import { useFocusedRefresh, type Run } from "../src/state/useFocusedRefresh";
import { useNotificationAsk } from "../src/state/useNotificationAsk";
import { joinRequestGateway, RequestDecided, type MyRequest } from "../src/services/joinRequests";
import { offline } from "../src/services/contactInvites";
import { INVITE_COPY } from "../src/domain/inviteCopy";
import { requestResponse, waitingCopy } from "../src/domain/joinView";
import { ANSWER_OPTIONS, answerKey, type AnswerKey } from "../src/domain/rsvp";

const failure = (e: unknown) => (e instanceof Error ? e.message : offline);

/**
 * Plan 3: an open link's request (/waiting?plan=), read from my_join_requests. Waiting: the invitation's card,
 * "Waiting for <host>", the answer (change_join_answer) and Done. Declined: "You weren’t added to this resbite."
 * A change refused because the host answered meanwhile shows no error: the request is read again quietly.
 * When the request isn't listed any more (approved, or the event is gone) the screen replaces itself with the
 * event. Approval grants access, so an account still read as waiting is read again first, and goes to /account
 * if it still waits. Reachable while the account waits for access (session-guarded in _layout). Without a plan
 * it leaves as Done does. Plan 4: a Going or Maybe answer here brings "Get notified?" (the host's approval
 * is sent as a notification).
 */
export default function Waiting() {
  const { plan } = useLocalSearchParams<{ plan?: string }>();
  const { session } = useApp();
  const account = useAccount();
  const approved = account.status === "approved" && account.reviewed;
  const approvedNow = useRef(approved);
  approvedNow.current = approved;
  const identity = `${session?.user.id ?? ""}:${plan ?? ""}`;
  const [request, setRequest] = useState<MyRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(plan));
  const [saving, setSaving] = useState<AnswerKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<"reading" | "read" | null>(null);
  const leaving = useRef(false);
  // The answer just saved here, for the notification ask.
  const [answered, setAnswered] = useState<{ identity: string; response: string } | null>(null);
  const ask = useNotificationAsk({ response: answered?.identity === identity ? answered.response : null });

  const load = useCallback(
    async (begin: () => Run) => {
      if (!session || !plan || leaving.current) return;
      const { valid } = begin();
      setLoading(true);
      setLoadError(null);
      try {
        const found = (await joinRequestGateway.mine()).find((r) => r.plan_id === plan);
        if (!valid()) return;
        if (!found) {
          leaving.current = true;
          if (approvedNow.current) router.replace({ pathname: "/event", params: { plan } });
          else {
            setHandoff("reading");
            void account.refresh().then(() => setHandoff("read"));
          }
          return;
        }
        setRequest(found);
        // Decided meanwhile: an error from changing the answer no longer applies.
        if (found.status !== "waiting") setError(null);
      } catch (e) {
        if (valid()) setLoadError(failure(e));
      } finally {
        if (valid()) setLoading(false);
      }
    },
    [identity],
  );
  const { refresh, begin } = useFocusedRefresh(load, { identity });
  // Routes on a settled read only: a refresh another read superseded resolves while that one is still checking.
  useEffect(() => {
    if (handoff !== "read" || !plan || account.status === "checking") return;
    if (approved) router.replace({ pathname: "/event", params: { plan } });
    else router.replace("/account");
  }, [handoff, approved, account.status]);
  useEffect(() => {
    if (plan || account.status === "checking") return;
    router.replace(approved ? "/plans" : "/account");
  }, [plan, approved, account.status]);

  async function choose(key: AnswerKey) {
    if (!plan || !request || saving) return;
    const { valid } = begin();
    setSaving(key);
    setError(null);
    let reread = false;
    try {
      const response = await joinRequestGateway.change(plan, requestResponse(key));
      if (valid()) {
        setRequest((current) => (current ? { ...current, response } : current));
        setAnswered({ identity, response });
      }
    } catch (e) {
      if (!valid()) return;
      // The host answered meanwhile (RequestDecided): no error, and the read below opens the event for an approved
      // request or says a declined one wasn't added. Any other failure is shown, and the host may have decided too.
      if (!(e instanceof RequestDecided)) setError(failure(e));
      reread = true;
    } finally {
      // Always: a refresh on focus or foreground may have begun meanwhile, and the control must not stay off.
      setSaving(null);
    }
    if (reread) void refresh();
  }
  function done() {
    if (router.canGoBack()) router.back();
    else router.replace(approved ? "/plans" : "/account");
  }

  const copy = request ? waitingCopy(request) : null;
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 40 }]}>
        {request && copy ? (
          <>
            <Title>{copy.title}</Title>
            <LinkCard
              title={request.title}
              startsAt={request.starts_at}
              endsAt={request.ends_at}
              area={request.area}
              host={request.host}
              image={request.image}
              showHost={request.status === "waiting"}
            />
            {copy.body ? <Copy>{copy.body}</Copy> : null}
            {copy.answerable ? (
              <Segmented
                label={INVITE_COPY.yourAnswer(request.title)}
                options={ANSWER_OPTIONS}
                value={saving ?? answerKey(request.response)}
                disabled={saving !== null || handoff !== null}
                onChange={(key) => void choose(key)}
              />
            ) : null}
            <ErrorNote message={error} />
            <ErrorNote message={ask.error} />
          </>
        ) : null}
        {(loading && !request) || handoff ? (
          <ActivityIndicator accessibilityLabel={INVITE_COPY.loadingRequest} color={c.aquaDark} />
        ) : null}
        <ErrorNote message={loadError} />
        {loadError ? <Button title="Retry" secondary onPress={() => void refresh()} /> : null}
        <Button large icon={false} title={INVITE_COPY.done} onPress={done} />
      </ScrollView>
      <NotificationAsk ask={ask} />
    </SafeAreaView>
  );
}
