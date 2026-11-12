import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Copy, ErrorNote, useLargeText } from "./ui";
import { Segmented } from "./kit";
import { SectionTitle } from "./ConnectionsPicker";
import { colors as c, depth, fonts, r } from "./tokens";
import { CIRCLE_COPY as C } from "../domain/circleCopy";
import {
  circleOf,
  circleSave,
  circleSentence,
  type BringInvites,
  type BringLevels,
  type Circle,
  type CircleSaveEvent,
  type CircleSaveState,
} from "../domain/circle";
import type { Plan } from "../domain/plans";
import { circleGateway, saveCircle } from "../services/circle";

type InvitesKey = "0" | "1" | "2" | "3";
type LevelsKey = "1" | "2" | "3";

const INVITE_OPTIONS: readonly { key: InvitesKey; text: string; label: string }[] = [
  { key: "0", text: C.nobody, label: C.nobody },
  ...([1, 2, 3] as const).map((n) => ({ key: String(n) as InvitesKey, text: String(n), label: C.bringsLabel(n) })),
];
const LEVEL_OPTIONS: readonly { key: LevelsKey; text: string }[] = ([1, 2, 3] as const).map((n) => ({
  key: String(n) as LevelsKey,
  text: C.levels(n),
}));

const settled = (circle: Circle, version: number): CircleSaveState => ({ saved: circle, shown: circle, saving: false, version });
const same = (a: Circle, b: Circle) => a.invites === b.invites && a.levels === b.levels;

/**
 * The Circle of trust card on Invite people (CO-04): how many people each guest may bring and how far it goes, and a
 * sentence that says what that means with `firstGuest`'s name. Each change saves at once; both choices wait while a
 * save is in flight, and a failure shows the saved value again with its words under the card. Any failure but a
 * refused number calls `onReload`: the screen reads the plan again and shows its gate, or what the server holds. A
 * plan read older than the card's last confirmed save is ignored, and a read that changes what is shown clears the
 * line. The screen renders it only for a host, outside the preview.
 */
export function CircleCard({
  plan,
  firstGuest,
  onReload,
}: {
  plan: Pick<Plan, "id" | "version" | "bring_invites" | "bring_levels">;
  firstGuest: string;
  onReload: () => void;
}) {
  const largeText = useLargeText();
  const fromPlan = circleOf(plan);
  const [state, setState] = useState<CircleSaveState>(() => settled(fromPlan, plan.version));
  const [error, setError] = useState<string | null>(null);
  // The state each event reduces, current even between two taps in the same frame.
  const current = useRef(state);
  const live = useRef(true);
  useEffect(() => {
    // Set here too, so the card stays live after StrictMode's unmount and remount.
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const dispatch = useCallback((event: CircleSaveEvent) => {
    const before = current.current;
    const next = circleSave(before, event);
    current.current = next;
    setState(next);
    return next !== before;
  }, []);

  // Each plan read the screen passes in (and the current one again once a save ends) goes through the reducer, which
  // takes it only when it is at least as new as the last confirmed save (D8). A read that changes what is shown is
  // newer than any line under the card, so the line goes.
  const { saving } = state;
  useEffect(() => {
    const before = current.current;
    if (!dispatch({ type: "read", value: fromPlan, version: plan.version })) return;
    if (!same(before.shown, current.current.shown)) setError(null);
    // fromPlan is rebuilt each render; its two numbers and the plan's version say when it changed.
  }, [dispatch, plan.id, plan.version, fromPlan.invites, fromPlan.levels, saving]);

  function choose(value: Circle) {
    if (!dispatch({ type: "tap", value })) return;
    setError(null);
    void saveCircle(circleGateway, plan.id, value).then(({ event, error: failed }) => {
      if (!live.current) return;
      dispatch(event);
      if (!failed) return;
      setError(failed.message);
      if (failed.reload) onReload();
    });
  }

  const { shown } = state;
  const sentence = circleSentence({ name: firstGuest, ...shown });
  return (
    <View style={styles.section}>
      <SectionTitle>{C.heading}</SectionTitle>
      <View style={[styles.card, largeText && styles.cardLarge]}>
        <Copy style={styles.hint}>{C.hint}</Copy>
        <Copy style={styles.label}>{C.eachBrings}</Copy>
        <Segmented<InvitesKey>
          label={C.eachBrings}
          options={INVITE_OPTIONS}
          value={String(shown.invites) as InvitesKey}
          disabled={saving}
          onChange={(key) => choose({ invites: Number(key) as BringInvites, levels: shown.levels })}
        />
        {shown.invites > 0 && (
          <>
            <Copy style={styles.label}>{C.howFar}</Copy>
            <Segmented<LevelsKey>
              label={C.howFar}
              options={LEVEL_OPTIONS}
              value={String(shown.levels) as LevelsKey}
              disabled={saving}
              onChange={(key) => choose({ invites: shown.invites, levels: Number(key) as BringLevels })}
            />
          </>
        )}
        {/* After both choices in the tree, so it is read after them (rule 11). */}
        {!!sentence && (
          <View style={styles.sentence}>
            <Copy accessibilityLiveRegion="polite" style={styles.sentenceText}>
              {/* The sentence starts with the name, in the semibold the design gives it. */}
              <Text style={styles.name}>{firstGuest}</Text>
              {sentence.slice(firstGuest.length)}
            </Copy>
          </View>
        )}
      </View>
      <ErrorNote message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  card: {
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: r.tile,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    boxShadow: depth.card,
  },
  // Larger Text keeps more of the width for the stacked options and the sentence.
  cardLarge: { paddingHorizontal: 12 },
  hint: { fontSize: 13, lineHeight: 19, color: c.muted },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: 4 },
  sentence: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.purpleSoft },
  sentenceText: { fontSize: 13, lineHeight: 19 },
  name: { fontFamily: fonts.medium },
});
