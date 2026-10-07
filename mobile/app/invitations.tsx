import { invitationLink } from "../src/services/invitations";
import { Users, Link2, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Platform,
  ScrollView,
  Share,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  Back,
  ActionRow,
  TextAction,
  Button,
  Copy,
  ErrorNote,
  Title,
  s,
} from "../src/design/ui";
import { PreviewNotice } from "../src/design/Chrome";
import { colors as c } from "../src/design/tokens";
import { useApp } from "../src/state/AppState";
import { peopleStore } from "../src/services/people";
import { planGateway } from "../src/services/plans";
import { invitationGateway } from "../src/services/invitations";
import { canEditPlan } from "../src/domain/plans";
import {
  prepareInvitation,
  revokeInvitation,
  type InvitationSlot,
} from "../src/domain/invitations";
import type { Person } from "../src/domain/people";
export default function Invitations() {
  const { plan: planId } = useLocalSearchParams<{ plan: string }>();
  const { session, preview, localPlans } = useApp();
  const scope = preview ? "preview" : session?.user.id;
  const [people, setPeople] = useState<Person[]>([]);
  const [slots, setSlots] = useState<InvitationSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const focused = useRef(false);
  const focusEpoch = useRef(0);
  const mounted = useRef(true);
  const identity = `${scope ?? ""}:${planId}`;
  const current = useRef(identity);
  current.current = identity;
  const [loadedIdentity, setLoadedIdentity] = useState("");
  const request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = () =>
    mounted.current && focused.current && current.current === identity;
  const assertCurrent = () => {
    if (!isCurrent())
      throw Error("Session changed. Reopen invitations to continue.");
  };
  async function reload() {
    if (!scope) return;
    const data = await peopleStore.list(scope);
    if (isCurrent()) {
      setPeople(data.plans[planId] ?? []);
      setSlots((data.invitations ?? []).filter((i) => i.planId === planId));
      setLoadedIdentity(identity);
    }
  }
  useFocusEffect(
    useCallback(() => {
      let active = true;
      focused.current = true;
      focusEpoch.current++;
      setBusy(working.current);
      async function refresh() {
        const serial = ++request.current;
        const valid = () =>
          active &&
          mounted.current &&
          current.current === identity &&
          serial === request.current;
        setLoading(true);
        setAvailable(false);
        setError(null);
        setNotice("");
        try {
          if (!scope || !planId) throw Error("Choose a plan first.");
          const p = preview
            ? localPlans.find((p) => p.id === planId)
            : await planGateway.read(planId);
          if (!p || !canEditPlan(p, session?.user.id, preview))
            throw Error(
              "Only the organizer can manage invitations for an upcoming active plan.",
            );
          const data = await peopleStore.list(scope);
          if (valid()) {
            setPeople(data.plans[planId] ?? []);
            setSlots(
              (data.invitations ?? []).filter((i) => i.planId === planId),
            );
            setLoadedIdentity(identity);
            setAvailable(true);
          }
        } catch (e) {
          if (valid())
            setError(
              e instanceof Error ? e.message : "Could not load invitations.",
            );
        } finally {
          if (valid()) setLoading(false);
        }
      }
      void refresh();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active" && !working.current) void refresh();
      });
      return () => {
        active = false;
        focused.current = false;
        focusEpoch.current++;
        subscription.remove();
      };
    }, [identity, retry, preview, localPlans, session?.user.id]),
  );
  async function run(work: (assertActive: () => void) => Promise<void>) {
    if (working.current || !isCurrent()) return;
    const epoch = focusEpoch.current;
    const assertActive = () => {
      assertCurrent();
      if (epoch !== focusEpoch.current)
        throw Error("Screen changed. Reopen invitations to continue.");
    };
    if (preview) {
      setNotice(
        "Invitations are disabled in design preview. Real invitations need an approved tester account.",
      );
      return;
    }
    if (!scope) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const p = await planGateway.read(planId);
      assertActive();
      if (!p || !canEditPlan(p, session?.user.id))
        throw Error("This plan is no longer available for invitations.");
      await work(assertActive);
    } catch (e) {
      if (isCurrent())
        setError(
          e instanceof Error ? e.message : "Could not finish. Please retry.",
        );
    } finally {
      if (isCurrent())
        try {
          await reload();
        } catch {
          if (isCurrent()) {
            setAvailable(false);
            setError(
              "Couldn’t reload local links. Reopen this screen before continuing.",
            );
          }
        }
      working.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  async function prepare(targetKey: string, label: string, share = false) {
    await run(async (assertActive) => {
      const token = Array.from(await Crypto.getRandomBytesAsync(32))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      assertActive();
      const slot = await prepareInvitation(
        peopleStore,
        invitationGateway,
        scope!,
        {
          id: Crypto.randomUUID(),
          token,
          planId,
          targetKey,
          label,
          state: "pending",
        },
        assertActive,
      );
      assertActive();
      if (share) {
        const result = await Share.share({
          message: `Join my Resbite plan: ${invitationLink(slot.token)}`,
        });
        if (isCurrent())
          setNotice(
            result?.action === Share.dismissedAction
              ? "Share sheet closed. Your link is still ready."
              : "Share sheet completed. Delivery and RSVP are not confirmed.",
          );
      } else setNotice("Link prepared. Nothing has been sent.");
    });
  }
  function revoke(slot: InvitationSlot) {
    const action = () =>
      void run(async (assertActive) => {
        await revokeInvitation(
          peopleStore,
          invitationGateway,
          scope!,
          slot,
          assertActive,
        );
        if (isCurrent()) setNotice("Link revoked.");
      });
    const message =
      "This link will stop working. If someone already claimed it and has no other active invitation, they will also be removed from the plan.";
    if (Platform.OS === "web") {
      if (window.confirm(message)) action();
    } else
      Alert.alert("Revoke this link?", message, [
        { text: "Keep link", style: "cancel" },
        { text: "Revoke", style: "destructive", onPress: action },
      ]);
  }
  const targets = [
    ...people.map((p) => ({ key: p.key, label: p.name, address: p.address })),
    ...slots
      .filter((i) => !people.some((p) => p.key === i.targetKey))
      .map((i) => ({ key: i.targetKey, label: i.label, address: "" })),
  ].filter((t, i, all) => all.findIndex((x) => x.key === t.key) === i);
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 32 }]}>
        <PreviewNotice dismissible={false} />
        <Back label="My resbites" />
        <Title>A little invitation.</Title>
        <Copy>
          Prepare a separate link for each person, then choose where to share
          it.
        </Copy>
        <Copy style={s.muted}>
          Each link is claimed by the first eligible account that opens it.
          Choose the intended recipient in the share sheet; contact details stay
          on this device. Links currently require Resbite to be installed.
        </Copy>
        <ErrorNote message={error} />
        {Boolean(notice) && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {notice}
          </Copy>
        )}
        {loading && <Copy>Loading invitations…</Copy>}
        {!loading && !available && (
          <Button title="Try again" onPress={() => setRetry((n) => n + 1)} />
        )}
        {available && loadedIdentity === identity && (
          <>
            <ActionRow
              icon={Users}
              title="Choose people"
              disabled={busy}
              onPress={() =>
                router.push({ pathname: "/people", params: { plan: planId } })
              }
            />
            {targets.map((t) => {
              const slot = [...slots]
                .reverse()
                .find((i) => i.targetKey === t.key);
              return (
                <View key={t.key} style={[s.card, { padding: 20, gap: 14 }]}>
                  <Title style={{ fontSize: 23 }}>{t.label}</Title>
                  {Boolean(t.address) && (
                    <Copy style={s.muted}>{t.address}</Copy>
                  )}
                  <Copy style={s.muted}>
                    {slot?.state === "ready"
                      ? "Link prepared · delivery not confirmed"
                      : slot?.state === "pending"
                        ? "Preparation not confirmed · retry before sharing or revoking"
                        : slot?.state === "revoking"
                          ? "Revocation not confirmed · sharing disabled"
                          : slot?.state === "revoked"
                            ? "Link revoked"
                            : "No link prepared"}
                  </Copy>
                  {slot?.state === "revoking" ? (
                    <Button
                      title={`Retry revocation for ${t.label}`}
                      disabled={busy}
                      onPress={() => revoke(slot)}
                    />
                  ) : (
                    <Button
                      title={
                        slot?.state === "ready"
                          ? `Share link for ${t.label}`
                          : slot?.state === "pending"
                            ? `Retry link for ${t.label}`
                            : `Prepare link for ${t.label}`
                      }
                      disabled={busy}
                      onPress={() =>
                        void prepare(t.key, t.label, slot?.state === "ready")
                      }
                    />
                  )}
                  {slot && slot.state === "ready" && (
                    <TextAction
                      icon={Trash2}
                      destructive
                      title={`Revoke link for ${t.label}`}
                      disabled={busy}
                      onPress={() => revoke(slot)}
                    />
                  )}
                </View>
              );
            })}
            <ActionRow
              icon={Link2}
              tone="violet"
              title="Prepare a separate link"
              disabled={busy}
              onPress={() =>
                void prepare(
                  `manual:${Crypto.randomUUID()}`,
                  `Invitation ${slots.filter((i) => i.targetKey.startsWith("manual:")).length + 1}`,
                )
              }
            />
            <Copy style={s.muted}>
              Removing someone from a group or selection does not revoke a
              prepared link. Revocation is a separate action. Signing out
              removes these local link records; it does not revoke links already
              shared.
            </Copy>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
