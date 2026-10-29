import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Calendar } from "lucide-react-native";
import { Button, Copy } from "./ui";
import { Chip, Segmented } from "./kit";
import { GrabberSheet } from "./GrabberSheet";
import { PickerCard } from "./SchedulePicker";
import { colors as c, fonts, space } from "./tokens";
import { PLAN_COPY } from "../domain/planCopy";
import { EMPTY_FORM, applyDuration, moveStart, type PlanForm } from "../domain/planForm";
import { addDays, localDay } from "../domain/schedule";
import { repeatChoice, shortDate } from "../domain/whenText";

export type WhenValue = Pick<PlanForm, "date" | "start" | "end" | "repeatWeeks">;

const DURATIONS = [
  { minutes: 30, text: PLAN_COPY.d30 },
  { minutes: 60, text: PLAN_COPY.d60 },
  { minutes: 120, text: PLAN_COPY.d120 },
  { minutes: 180, text: PLAN_COPY.d180 },
  { minutes: "allDay", text: PLAN_COPY.allDay },
] as const;

const REPEATS = [null, 1, 2] as const;
type RepeatKey = "none" | "1" | "2";
const keyOf = (weeks: WhenValue["repeatWeeks"]): RepeatKey => (weeks === 1 ? "1" : weeks === 2 ? "2" : "none");

const pick = (f: PlanForm): WhenValue => ({ date: f.date, start: f.start, end: f.end, repeatWeeks: f.repeatWeeks });

/**
 * CR-B2: the date, the start and end times, quick durations and the repeat choice. The edits are
 * held here and reach the plan only through Done; closing any other way drops them.
 */
export function WhenSheet({
  visible,
  value,
  zone,
  onDone,
  onClose,
}: {
  visible: boolean;
  value: WhenValue;
  zone: string;
  onDone: (value: WhenValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WhenValue>(value);
  const [open, setOpen] = useState<"date" | "start" | "end" | null>(null);
  useEffect(() => {
    if (visible) {
      setDraft(value);
      setOpen(null);
    }
    // The sheet starts from the plan's value each time it opens.
  }, [visible]);

  const form: PlanForm = { ...EMPTY_FORM, ...draft };
  const set = (next: PlanForm) => setDraft(pick(next));
  const complete = Boolean(draft.date && draft.start && draft.end);
  const tomorrow = localDay(addDays(new Date(), 1));
  const dateText = draft.date ? shortDate(`${draft.date}T12:00:00Z`, "UTC") : null;
  const matches = (minutes: (typeof DURATIONS)[number]["minutes"]) => {
    const next = applyDuration(form, minutes);
    return next.start === form.start && next.end === form.end && form.end !== null;
  };

  return (
    <GrabberSheet visible={visible} title={PLAN_COPY.when} icon={Calendar} onClose={onClose}>
      <PickerCard
        kind="date"
        label={PLAN_COPY.date}
        value={draft.date}
        text={dateText}
        seed={tomorrow}
        open={open === "date"}
        onOpen={(o) => setOpen(o ? "date" : null)}
        onPick={(date) => setDraft((d) => ({ ...d, date }))}
      />
      <PickerCard
        kind="time"
        label={PLAN_COPY.startTime}
        value={draft.start}
        text={draft.start}
        seed="10:00"
        open={open === "start"}
        onOpen={(o) => setOpen(o ? "start" : null)}
        onPick={(start) => set(moveStart(form, start))}
      />
      <PickerCard
        kind="time"
        label={PLAN_COPY.endTime}
        value={draft.end}
        text={draft.end}
        seed={draft.start ? (applyDuration(form, 60).end ?? "11:00") : "11:00"}
        open={open === "end"}
        onOpen={(o) => setOpen(o ? "end" : null)}
        onPick={(end) => setDraft((d) => ({ ...d, end }))}
      />
      <Copy style={styles.section}>{PLAN_COPY.quickDuration}</Copy>
      <View style={styles.chips}>
        {DURATIONS.map((d) => (
          <Chip
            key={d.text}
            text={d.text}
            selected={matches(d.minutes)}
            disabled={d.minutes !== "allDay" && !draft.start}
            onPress={() => set(applyDuration(form, d.minutes))}
          />
        ))}
      </View>
      <Copy style={styles.note}>{PLAN_COPY.chatCloses}</Copy>
      <Copy style={styles.section}>{PLAN_COPY.repeats}</Copy>
      <Segmented<RepeatKey>
        label={PLAN_COPY.repeats}
        options={REPEATS.map((weeks) => ({ key: keyOf(weeks), text: repeatChoice(weeks) }))}
        value={keyOf(draft.repeatWeeks)}
        onChange={(key) => setDraft((d) => ({ ...d, repeatWeeks: key === "1" ? 1 : key === "2" ? 2 : null }))}
      />
      <View style={styles.done}>
        <Button large icon={false} title={PLAN_COPY.done} disabled={!complete} onPress={() => onDone(draft)} />
      </View>
    </GrabberSheet>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.medium, fontSize: 13, color: c.muted, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  note: { fontSize: 13, color: c.muted },
  done: { marginTop: space.m },
});
