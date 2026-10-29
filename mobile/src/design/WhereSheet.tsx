import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Compass, MapPin, TextAlignStart } from "lucide-react-native";
import { Button, Copy } from "./ui";
import { FieldCard } from "./kit";
import { GrabberSheet } from "./GrabberSheet";
import { TickRow } from "./TickRow";
import { colors as c, fonts, space } from "./tokens";
import { AREA_MAX, MEETING_DETAILS_MAX } from "../domain/eventDetails";
import { PLAN_COPY } from "../domain/planCopy";
import type { PlanForm } from "../domain/planForm";

export type WhereValue = Pick<PlanForm, "place" | "placeTbd" | "area" | "meetingDetails">;

/** The longest place (the plan's place column). */
const PLACE_MAX = 300;

/**
 * CR-B3: the place (typed, one of the recent places, or To be decided), then the area and the
 * meeting details. The edits are held here and reach the plan only through Done; closing any
 * other way drops them.
 */
export function WhereSheet({
  visible,
  value,
  recent,
  onDone,
  onClose,
}: {
  visible: boolean;
  value: WhereValue;
  recent: string[];
  onDone: (value: WhereValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WhereValue>(value);
  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    // The sheet starts from the plan's value each time it opens.
  }, [visible]);

  const ready = draft.placeTbd || draft.place.trim() !== "";
  const choose = (place: string) => {
    setDraft((d) => ({ ...d, place, placeTbd: false }));
  };

  return (
    <GrabberSheet visible={visible} title={PLAN_COPY.where} icon={MapPin} onClose={onClose}>
      <FieldCard
        label={PLAN_COPY.where}
        icon={MapPin}
        circle={c.pinkSoft}
        display
        placeholder={PLAN_COPY.placeSearch}
        value={draft.place}
        onChangeText={(place) => {
          setDraft((d) => ({ ...d, place, placeTbd: false }));
        }}
        maxLength={PLACE_MAX}
      />
      {recent.length > 0 && (
        <>
          <Copy style={styles.section}>{PLAN_COPY.recentPlaces}</Copy>
          {recent.map((place) => (
            <TickRow
              key={place}
              role="radio"
              label={place}
              checked={!draft.placeTbd && draft.place.trim() === place}
              onChange={(on) => {
                if (on) choose(place);
                else setDraft((d) => ({ ...d, place: "" }));
              }}
            >
              <Copy style={styles.hint}>{PLAN_COPY.recent}</Copy>
            </TickRow>
          ))}
        </>
      )}
      <TickRow
        role="radio"
        label={PLAN_COPY.toBeDecided}
        checked={draft.placeTbd}
        onChange={(on) => {
          setDraft((d) => (on ? { ...d, place: "", placeTbd: true } : { ...d, placeTbd: false }));
        }}
      >
        <Copy style={styles.hint}>{PLAN_COPY.canChangeLater}</Copy>
      </TickRow>
      <FieldCard
        label={PLAN_COPY.areaLabel}
        icon={Compass}
        placeholder={PLAN_COPY.areaLabel}
        value={draft.area}
        onChangeText={(area) => setDraft((d) => ({ ...d, area }))}
        maxLength={AREA_MAX}
      />
      <FieldCard
        label={PLAN_COPY.meetingDetails}
        icon={TextAlignStart}
        multiline
        minHeight={64}
        placeholder={PLAN_COPY.meetingDetails}
        value={draft.meetingDetails}
        onChangeText={(meetingDetails) => setDraft((d) => ({ ...d, meetingDetails }))}
        maxLength={MEETING_DETAILS_MAX}
      />
      <View style={styles.done}>
        <Button
          large
          icon={false}
          title={PLAN_COPY.done}
          disabled={!ready}
          onPress={() => onDone({ ...draft, place: draft.placeTbd ? "" : draft.place.trim() })}
        />
      </View>
    </GrabberSheet>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.medium, fontSize: 13, color: c.muted, marginTop: 4 },
  hint: { fontSize: 13, color: c.muted },
  done: { marginTop: space.m },
});
