import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Globe, History, LocateFixed, Plus, Send, Sparkles, Trash2 } from "lucide-react-native";
import { Button, Copy, ErrorNote, Field, TextAction, s, useLargeText } from "./ui";
import { Chip, CoverCard, Tile } from "./kit";
import { CoverPicker, CoverRecovery } from "./CoverPicker";
import { PlanSchedule } from "./PlanSchedule";
import { categoryIcons } from "./categories";
import { colors as c, fonts, r } from "./tokens";
import { categoryKeys, categoryLabels, toggleCategory } from "../domain/categories";
import { DESCRIPTION_MAX, TITLE_MAX, eventPicture } from "../domain/events";
import { coverNotice, reviewLabels, type CoverCardPart } from "../domain/eventView";
import { parseLocalDateTime } from "../domain/plans";
import { joinLocal, quickDays, quickTimes, shortDay, splitLocal, spokenDate } from "../domain/schedule";
import type { Step } from "../domain/steps";
import type { PlanEditor } from "../state/usePlanEditor";

// UX-D2 step cards. Each step only renders; all logic lives in usePlanEditor.
export const STEP_TITLES: Record<Step, string> = {
  what: "What’s the plan?",
  when: "When?",
  where: "Where?",
  vibe: "What’s the vibe?",
  review: "Looks good?",
};
/** Required steps say so to VoiceOver (spec principle 7). */
export const STEP_HINTS: Record<Step, string | undefined> = {
  what: "Required",
  when: "Required",
  where: "Required. A name or address is enough.",
  vibe: "Required. Choose one or two.",
  review: undefined,
};

const pictureOf = (editor: PlanEditor) =>
  eventPicture({ activity_id: editor.sourceId, categories: editor.fields.categories });
const startIso = (start: string) => parseLocalDateTime(start)?.toISOString() ?? null;
const vibeChips = (editor: PlanEditor) =>
  editor.fields.categories.map((key) => ({ key, text: categoryLabels[key], category: key, icon: categoryIcons[key] }));

export function WhatStep({ editor }: { editor: PlanEditor }) {
  const { fields, setFields, locked, cover } = editor;
  return (
    <>
      <Field
        label="Name"
        placeholder="Dinner at Mario’s, a birthday walk…"
        value={fields.title}
        onChangeText={(title) => setFields({ ...fields, title })}
        maxLength={TITLE_MAX}
        editable={!locked}
        returnKeyType="next"
        accessibilityHint="Required"
        style={styles.bigInput}
      />
      <CoverPicker cover={cover} disabled={locked} fallback={pictureOf(editor)} />
    </>
  );
}

export function WhenStep({ editor }: { editor: PlanEditor }) {
  const { start, setStart, locked, zone } = editor;
  const largeText = useLargeText();
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [typing, setTyping] = useState(false);
  const now = new Date();
  const days = quickDays(now);
  const { day, time } = splitLocal(start);
  const chosenDay = day ?? pendingDay;
  const quickDay = days.find((d) => d.day === chosenDay);
  const chosenDate = chosenDay ? parseLocalDateTime(`${chosenDay} 12:00`) : null;
  const pickedOther = Boolean(chosenDate && !quickDay);
  const times = quickTimes(chosenDay, now);
  const otherTime = time !== null && !times.some((t) => t.time === time);
  const chooseDay = (next: string) => {
    setPendingDay(next);
    if (time) setStart(joinLocal(next, time));
  };
  const chooseTime = (next: string) => {
    if (chosenDay) setStart(joinLocal(chosenDay, next));
  };
  // Web QA types into "Date and time (local)"; iOS opens the native picker sheet.
  const pick = (mode: "date" | "time") => (Platform.OS === "web" ? setTyping(true) : setPicker(mode));
  return (
    <>
      <View style={styles.grid}>
        {days.map((d) => (
          <View key={d.key} style={[styles.cell, largeText && styles.full]}>
            <Tile title={d.text} label={d.label} selected={quickDay?.key === d.key} disabled={locked} onPress={() => chooseDay(d.day)} />
          </View>
        ))}
        <View style={[styles.cell, largeText && styles.full]}>
          <Tile
            title={pickedOther && chosenDate ? shortDay(chosenDate) : "Pick"}
            label={pickedOther && chosenDate ? `Pick a day, ${spokenDate(chosenDate, now)} selected` : "Pick a day"}
            selected={pickedOther}
            disabled={locked}
            onPress={() => pick("date")}
          />
        </View>
      </View>
      <View style={styles.chips}>
        {times.map((t) => (
          <Chip
            key={t.time}
            text={t.time}
            label={t.label}
            hint={chosenDay ? (t.disabled ? "Already past" : undefined) : "Choose a day first"}
            selected={time === t.time}
            disabled={locked || t.disabled}
            onPress={() => chooseTime(t.time)}
          />
        ))}
        <Chip
          text={otherTime && time ? time : "⋯"}
          label={otherTime && time ? `Other time, ${time}` : "Other time"}
          selected={otherTime}
          disabled={locked}
          onPress={() => pick("time")}
        />
      </View>
      <Chip
        icon={Globe}
        text={(zone.split("/").pop() ?? zone).replaceAll("_", " ")}
        label={`Times shown in ${zone.replaceAll("_", " ")}`}
      />
      {(Platform.OS !== "web" || typing) && (
        <PlanSchedule
          value={start}
          onChange={setStart}
          disabled={locked}
          buttons={false}
          picker={picker}
          onPickerClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

export function WhereStep({ editor, recent }: { editor: PlanEditor; recent: readonly string[] }) {
  const { place, changePlace, note, setNote, locked, locating, locate } = editor;
  const current = place.trim().toLocaleLowerCase();
  return (
    <>
      <Field
        label="Meeting place"
        placeholder="A café, a park, your place…"
        value={place}
        onChangeText={changePlace}
        maxLength={300}
        editable={!locked}
        returnKeyType="done"
        accessibilityHint="Required. A name or address is enough."
      />
      <View style={styles.chips}>
        <Chip
          icon={LocateFixed}
          text={locating ? "Finding you…" : "Current location"}
          label="Use my location"
          hint="Location is optional"
          disabled={locked || locating}
          onPress={() => void locate()}
        />
        {recent.map((p) => (
          <Chip
            key={p}
            icon={History}
            text={p}
            label={`Use recent place ${p}`}
            selected={current === p.toLocaleLowerCase()}
            disabled={locked}
            onPress={() => changePlace(p)}
          />
        ))}
      </View>
      <Field
        label="A note for everyone (optional)"
        placeholder="What to bring, where to find you…"
        value={note}
        onChangeText={setNote}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 110 }}
        maxLength={2000}
        editable={!locked}
      />
    </>
  );
}

export function VibeStep({ editor }: { editor: PlanEditor }) {
  const { fields, setFields, locked } = editor;
  const largeText = useLargeText();
  return (
    <View style={styles.grid}>
      {categoryKeys.map((key) => {
        const selected = fields.categories.includes(key);
        const full = !selected && fields.categories.length >= 2;
        return (
          <View key={key} style={[styles.cell, largeText && styles.full]}>
            <Tile
              role="checkbox"
              title={categoryLabels[key]}
              icon={categoryIcons[key]}
              category={key}
              selected={selected}
              disabled={locked || full}
              hint={full ? "Two categories are already chosen" : undefined}
              onPress={() => setFields({ ...fields, categories: toggleCategory(fields.categories, key) })}
            />
          </View>
        );
      })}
    </View>
  );
}

/** Review is exactly what guests will see (benchmark row 4); each part jumps to its step. */
export function ReviewStep({ editor, onJump }: { editor: PlanEditor; onJump: (part: CoverCardPart) => void }) {
  const { fields, setFields, place, note, start, locked, cover, sourceId, idea, historicalActivity } = editor;
  const [describing, setDescribing] = useState(Boolean(fields.description));
  const at = startIso(start);
  const sourceTitle = sourceId ? (idea?.title ?? historicalActivity?.title) : undefined;
  return (
    <>
      <CoverCard
        hero
        picture={pictureOf(editor)}
        uri={cover.uri}
        title={fields.title.trim() || "Your resbite"}
        startsAt={at}
        place={place}
        chips={vibeChips(editor)}
        onPressPart={onJump}
        partLabels={reviewLabels({ title: fields.title, startsAt: at, place, categories: fields.categories }, new Date())}
      />
      {sourceTitle ? <Chip icon={Sparkles} tone="aqua" text={sourceTitle} label={`From the idea ${sourceTitle}`} /> : null}
      {describing ? (
        <Field
          label="Description (optional)"
          placeholder="What you’ll do together"
          value={fields.description}
          onChangeText={(description) => setFields({ ...fields, description })}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 90 }}
          maxLength={DESCRIPTION_MAX}
          editable={!locked}
        />
      ) : (
        <Chip icon={Plus} text="Description" label="Add description" disabled={locked} onPress={() => setDescribing(true)} />
      )}
      {!!note && <Copy style={s.muted}>{note}</Copy>}
      {cover.pending && <CoverRecovery cover={cover} disabled={locked} />}
      {!!cover.message && (
        <Copy style={styles.hint} accessibilityLiveRegion="polite">
          {cover.message}
        </Copy>
      )}
      {editor.latest !== undefined && <LatestSaved editor={editor} />}
      {editor.pending && (
        <Copy style={s.muted}>
          The fields are held while the save is unconfirmed, so retrying sends exactly the same details.
        </Copy>
      )}
      {!editor.pending && !editor.busy && (
        <TextAction icon={Trash2} destructive title="Discard draft" onPress={editor.discardDraft} />
      )}
    </>
  );
}

function LatestSaved({ editor }: { editor: PlanEditor }) {
  const latest = editor.latest;
  return (
    <View style={styles.latest}>
      <Copy style={{ fontFamily: fonts.medium }}>Latest saved plan</Copy>
      {latest ? (
        <>
          <Copy>{latest.title}</Copy>
          <Copy>{new Date(latest.starts_at).toLocaleString()}</Copy>
          <Copy>{latest.place_label}</Copy>
          <Copy>{latest.note || "No note"}</Copy>
          {editor.latestEditable ? (
            <>
              <Copy style={s.muted}>Using these details replaces your unsaved draft.</Copy>
              <Button title="Use latest saved details" secondary onPress={() => editor.applyPlan(latest)} />
            </>
          ) : (
            <Copy>This plan is no longer editable.</Copy>
          )}
        </>
      ) : (
        <Copy>This plan is no longer available to your account.</Copy>
      )}
    </View>
  );
}

/** After a create (benchmark row 1): the picture, one large Invite tile, and the cover notice if the upload failed. */
export function InviteNext({ editor, onInvite }: { editor: PlanEditor; onInvite: () => void }) {
  return (
    <>
      <CoverCard
        hero
        heading={false}
        picture={pictureOf(editor)}
        uri={editor.cover.uri}
        title={editor.fields.title.trim()}
        startsAt={startIso(editor.start)}
        place={editor.place}
        chips={vibeChips(editor)}
      />
      <ErrorNote message={coverNotice(editor.created?.cover)} />
      <Tile size="large" icon={Send} title="Invite people" hint="Prepare a link for each person" onPress={onInvite} />
    </>
  );
}

/** Draft and save problems, in their current wording, on every step. */
export function DraftProblems({ editor }: { editor: PlanEditor }) {
  return (
    <>
      <ErrorNote message={editor.draftError} />
      {editor.draftError && <Button title={editor.draftRetryLabel} secondary onPress={editor.retryDraft} />}
      <ErrorNote message={editor.error} />
    </>
  );
}

const styles = StyleSheet.create({
  bigInput: { fontFamily: fonts.display, fontSize: 22, minHeight: 60 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { width: "48%" },
  full: { width: "100%" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hint: { fontSize: 12, color: c.muted },
  latest: { gap: 10, padding: 18, borderRadius: r.tile, backgroundColor: c.pinkSoft },
});
