import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
  Check,
  Clock,
  Globe,
  LocateFixed,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Send,
  Sparkles,
  TextAlignStart,
  Trash2,
} from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, s, useLargeText } from "./ui";
import { Chip, CoverCard, FieldCard, ScalePressable, Tile } from "./kit";
import { CoverPicker, CoverRecovery } from "./CoverPicker";
import { EndSchedule, PlanSchedule } from "./PlanSchedule";
import { categoryIcons } from "./categories";
import { categoryPalette, colors as c, depth, fonts, r } from "./tokens";
import { categoryKeys, categoryLabels, toggleCategory, type CategoryKey } from "../domain/categories";
import { canDiscardDraft } from "../domain/draftAutosave";
import { DESCRIPTION_MAX, TITLE_MAX, eventPicture } from "../domain/events";
import { MEETING_DETAILS_HINT } from "../domain/eventDetails";
import { defaultEnd } from "../domain/eventTime";
import { coverNotice, reviewLabels, type CoverCardPart } from "../domain/eventView";
import { parseLocalDateTime } from "../domain/plans";
import { joinLocal, quickDays, quickTimes, splitLocal, zoneLabel } from "../domain/schedule";
import type { Step } from "../domain/steps";
import type { PlanEditor } from "../state/usePlanEditor";

// UX-D2 step cards, steps v2 look (owner-approved mockup): bigger cards, chips and tiles, the
// pickers first. Each step only renders; all logic lives in usePlanEditor.
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
/** The editor's end as an instant for cards; null when there is none or it can't be read yet. */
const endIso = (end: string) => (end ? startIso(end) : null);
const vibeChips = (editor: PlanEditor) =>
  editor.fields.categories.map((key) => ({ key, text: categoryLabels[key], category: key, icon: categoryIcons[key] }));
/** A 52 pt suggestion chip (day or time); selected fills aqua. */
function StepChip({
  text,
  label,
  hint,
  selected,
  disabled,
  column = false,
  onPress,
}: {
  text: string;
  label: string;
  hint?: string;
  selected: boolean;
  disabled: boolean;
  /** One of equal columns in a row (the time chips) instead of its own width. */
  column?: boolean;
  onPress: () => void;
}) {
  return (
    <ScalePressable
      outerStyle={column ? styles.chipColumn : styles.chipOuter}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-selected={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        column && styles.chipNarrow,
        selected && styles.chipOn,
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      <Copy style={selected ? [styles.chipText, styles.chipTextOn] : styles.chipText}>{text}</Copy>
    </ScalePressable>
  );
}

export function WhatStep({ editor }: { editor: PlanEditor }) {
  const { fields, setFields, locked, cover } = editor;
  return (
    <>
      <CoverPicker cover={cover} disabled={locked} fallback={pictureOf(editor)} />
      <FieldCard
        label="Name"
        icon={Pencil}
        display
        placeholder="Name your resbite"
        value={fields.title}
        onChangeText={(title) => setFields({ ...fields, title })}
        maxLength={TITLE_MAX}
        editable={!locked}
        returnKeyType="next"
        accessibilityHint="Required"
      />
      <FieldCard
        label="Description (optional)"
        icon={TextAlignStart}
        placeholder="What you’ll do together (optional)"
        value={fields.description}
        onChangeText={(description) => setFields({ ...fields, description })}
        multiline
        minHeight={120}
        maxLength={DESCRIPTION_MAX}
        editable={!locked}
      />
    </>
  );
}

export function WhenStep({ editor }: { editor: PlanEditor }) {
  const { start, setStart, end, setEnd, locked, zone } = editor;
  const largeText = useLargeText();
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const now = new Date();
  const days = quickDays(now);
  const { day, time } = splitLocal(start);
  const chosenDay = day ?? pendingDay;
  const quickDay = days.find((d) => d.day === chosenDay);
  const times = quickTimes(chosenDay, now);
  const chooseDay = (next: string) => {
    setPendingDay(next);
    if (time) setStart(joinLocal(next, time));
  };
  const chooseTime = (next: string) => {
    if (chosenDay) setStart(joinLocal(chosenDay, next));
  };
  // The picker first, full width, then its suggestions (steps v2); the web field covers both.
  // An unchosen day or time reads "Choose a day" / "Choose a time", never a picker holding a value.
  return (
    <>
      <View style={styles.section}>
        <PlanSchedule
          part="date"
          value={start}
          day={chosenDay}
          set={chosenDay !== null}
          onDay={chooseDay}
          onChange={setStart}
          disabled={locked}
        />
        <View style={styles.chips}>
          {days.map((d) => (
            <StepChip
              key={d.key}
              text={d.text}
              label={d.label}
              selected={quickDay?.key === d.key}
              disabled={locked}
              onPress={() => chooseDay(d.day)}
            />
          ))}
        </View>
      </View>
      <View style={[styles.section, styles.timeSection]}>
        <PlanSchedule
          part="time"
          value={start}
          day={chosenDay}
          set={time !== null}
          onDay={chooseDay}
          onChange={setStart}
          disabled={locked}
        />
        {/* The four times share one row, as in the mockup; under Larger Text they wrap. */}
        <View style={largeText ? styles.chips : styles.timeRow}>
          {times.map((t) => (
            <StepChip
              key={t.time}
              column={!largeText}
              text={t.time}
              label={t.label}
              hint={chosenDay ? (t.disabled ? "Already past" : undefined) : "Choose a day first"}
              selected={time === t.time}
              disabled={locked || t.disabled}
              onPress={() => chooseTime(t.time)}
            />
          ))}
        </View>
      </View>
      {/* UX3: the optional end, empty by default; it needs a chosen start to begin from. */}
      <View style={styles.section}>
        {end ? (
          <EndSchedule value={end} start={start} onChange={setEnd} onRemove={() => setEnd("")} disabled={locked} />
        ) : (
          <Chip
            icon={Plus}
            text="End time"
            label="Add an end time"
            hint={parseLocalDateTime(start) ? undefined : "Choose a day and time first"}
            disabled={locked || !parseLocalDateTime(start)}
            onPress={() => setEnd(defaultEnd(start))}
          />
        )}
        {!end && <Copy style={styles.endHint}>Optional. Without it, calendars get a 1-hour event.</Copy>}
      </View>
      <View accessible accessibilityLabel={`Times shown in ${zone.replaceAll("_", " ")}`} style={styles.zone}>
        <Globe size={18} strokeWidth={2} color={c.muted} />
        <Copy style={styles.zoneText}>{zoneLabel(zone)}</Copy>
      </View>
    </>
  );
}

export function WhereStep({ editor, recent }: { editor: PlanEditor; recent: readonly string[] }) {
  const { place, changePlace, note, setNote, locked, locating, locate } = editor;
  const current = place.trim().toLocaleLowerCase();
  return (
    <>
      <FieldCard
        label="Meeting place"
        icon={MapPin}
        circle={c.pinkSoft}
        display
        placeholder="A café, a park, your place…"
        value={place}
        onChangeText={changePlace}
        maxLength={300}
        editable={!locked}
        returnKeyType="done"
        accessibilityHint="Required. A name or address is enough."
      />
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel="Use my location"
        accessibilityHint="Location is optional"
        aria-disabled={locked || locating}
        aria-busy={locating}
        disabled={locked || locating}
        onPress={() => void locate()}
        style={({ pressed }) => [styles.locate, { opacity: locked ? 0.45 : pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.circle44, { backgroundColor: c.paper }]}>
          {locating ? (
            <ActivityIndicator color={c.aquaDark} />
          ) : (
            <LocateFixed size={24} strokeWidth={2.2} color={c.aquaDark} />
          )}
        </View>
        <Copy style={styles.locateText}>{locating ? "Finding you…" : "Use my location"}</Copy>
      </ScalePressable>
      {recent.length > 0 && (
        <View style={styles.recent}>
          <Copy style={styles.sectionLabel}>Recent</Copy>
          <View style={styles.rows}>
            {recent.map((p, i) => {
              const selected = current === p.toLocaleLowerCase();
              return (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityLabel={`Use recent place ${p}`}
                  aria-selected={selected}
                  aria-disabled={locked}
                  disabled={locked}
                  onPress={() => changePlace(p)}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.rowDivider,
                    { backgroundColor: pressed ? c.surface : "transparent", opacity: locked ? 0.45 : 1 },
                  ]}
                >
                  <View style={[styles.circle40, { backgroundColor: c.surface }]}>
                    <Clock size={20} strokeWidth={2.2} color={c.muted} />
                  </View>
                  <Copy style={styles.rowText}>{p}</Copy>
                  {selected && <Check size={22} strokeWidth={2.4} color={c.aquaDark} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {/* UX3-D5: today's note becomes private Meeting details, read only by the organizer and Going or Maybe guests. */}
      <View style={styles.meeting}>
        <FieldCard
          label="Meeting details (optional)"
          icon={Lock}
          placeholder="Door code, meeting spot… (optional)"
          value={note}
          onChangeText={setNote}
          multiline
          minHeight={110}
          maxLength={2000}
          editable={!locked}
        />
        <Copy style={styles.meetingHint}>{MEETING_DETAILS_HINT}</Copy>
      </View>
    </>
  );
}

/** A 108 pt category tile: tint, the icon in a white circle, the name; selected fills with the ink and shows ✓. */
function VibeTile({
  category,
  selected,
  disabled,
  hint,
  onPress,
}: {
  category: CategoryKey;
  selected: boolean;
  disabled: boolean;
  hint?: string;
  onPress: () => void;
}) {
  const Icon = categoryIcons[category];
  const { tint, ink } = categoryPalette[category];
  return (
    <ScalePressable
      outerStyle={styles.vibeCell}
      accessibilityRole="checkbox"
      accessibilityLabel={categoryLabels[category]}
      accessibilityHint={hint}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.vibe,
        {
          backgroundColor: selected ? ink : tint,
          borderColor: selected ? ink : "#EFEAF0",
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.vibeTop}>
        <View style={[styles.circle44, { backgroundColor: selected ? "rgba(255, 255, 255, 0.2)" : c.paper }]}>
          <Icon size={24} strokeWidth={1.9} color={selected ? c.paper : ink} />
        </View>
        {selected && <Check size={24} strokeWidth={2.6} color={c.paper} />}
      </View>
      <Copy style={[styles.vibeName, { color: selected ? c.paper : ink }]}>{categoryLabels[category]}</Copy>
    </ScalePressable>
  );
}

export function VibeStep({ editor }: { editor: PlanEditor }) {
  const { fields, setFields, locked } = editor;
  const largeText = useLargeText();
  // Two columns (one under Larger Text); a lone last tile keeps its half width.
  const rows: CategoryKey[][] = [];
  categoryKeys.forEach((key, i) => (largeText || i % 2 === 0 ? rows.push([key]) : rows[rows.length - 1].push(key)));
  return (
    <View style={styles.vibeGrid}>
      {rows.map((row) => (
        <View key={row.join()} style={styles.vibeRow}>
          {row.map((key) => {
            const selected = fields.categories.includes(key);
            const full = !selected && fields.categories.length >= 2;
            return (
              <VibeTile
                key={key}
                category={key}
                selected={selected}
                disabled={locked || full}
                hint={full ? "Two categories are already chosen" : undefined}
                onPress={() => setFields({ ...fields, categories: toggleCategory(fields.categories, key) })}
              />
            );
          })}
          {!largeText && row.length === 1 && <View style={styles.vibeCell} />}
        </View>
      ))}
    </View>
  );
}

/** Review is exactly what guests will see (benchmark row 4); each part jumps to its step. */
export function ReviewStep({ editor, onJump }: { editor: PlanEditor; onJump: (part: CoverCardPart) => void }) {
  const { fields, place, note, start, end, locked, cover, sourceId, idea, historicalActivity } = editor;
  const at = startIso(start);
  const until = endIso(end);
  const description = fields.description.trim();
  const sourceTitle = sourceId ? (idea?.title ?? historicalActivity?.title) : undefined;
  return (
    <>
      <CoverCard
        hero
        picture={pictureOf(editor)}
        uri={cover.uri}
        title={fields.title.trim() || "Your resbite"}
        startsAt={at}
        endsAt={until}
        place={place}
        chips={vibeChips(editor)}
        onPressPart={onJump}
        partLabels={reviewLabels(
          { title: fields.title, startsAt: at, endsAt: until, place, categories: fields.categories, photo: cover.description },
          new Date(),
        )}
      />
      {sourceTitle ? <Chip icon={Sparkles} tone="aqua" text={sourceTitle} label={`From the idea ${sourceTitle}`} /> : null}
      {/* The description is written on What (steps v2); here it shows, and a tap goes to What like the name. */}
      {description ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit description, ${description}`}
          onPress={() => onJump("title")}
          style={({ pressed }) => [styles.description, pressed && { backgroundColor: c.surface }]}
        >
          <TextAlignStart size={20} strokeWidth={2} color={c.muted} />
          <Copy style={styles.descriptionText}>{fields.description}</Copy>
        </Pressable>
      ) : (
        <Chip icon={Plus} text="Description" label="Add description" disabled={locked} onPress={() => onJump("title")} />
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
      {canDiscardDraft(editor) && (
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
          <Copy>{latest.note || "No meeting details"}</Copy>
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
        pictureLabel={editor.cover.description}
        title={editor.fields.title.trim()}
        startsAt={startIso(editor.start)}
        endsAt={endIso(editor.end)}
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
  circle44: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  circle40: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  // When
  section: { gap: 12 },
  timeSection: { marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chipOuter: { alignSelf: "flex-start" },
  timeRow: { flexDirection: "row", gap: 10 },
  chipColumn: { flex: 1 },
  chipNarrow: { paddingHorizontal: 6 },
  chip: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    boxShadow: depth.small,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: c.aquaDark, borderColor: c.aquaDark },
  chipText: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: c.ink },
  chipTextOn: { color: c.paper },
  zone: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 },
  zoneText: { fontFamily: fonts.medium, fontSize: 14, color: c.muted, flexShrink: 1 },
  endHint: { fontSize: 14, color: c.muted, marginHorizontal: 4 },
  // Where
  locate: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: r.panel,
    backgroundColor: c.aquaSoft,
  },
  locateText: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: c.aquaDark, flexShrink: 1 },
  recent: { gap: 10, marginTop: 6 },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: c.muted,
    marginHorizontal: 4,
  },
  rows: {
    borderRadius: r.panel,
    overflow: "hidden",
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    boxShadow: depth.card,
  },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderColor: "#F1EDF1" },
  rowText: { flex: 1, fontFamily: fonts.medium, fontSize: 17, lineHeight: 22 },
  meeting: { gap: 10 },
  meetingHint: { fontSize: 14, color: c.muted, marginHorizontal: 4 },
  // Vibe
  vibeGrid: { gap: 12 },
  vibeRow: { flexDirection: "row", gap: 12 },
  vibeCell: { flex: 1 },
  vibe: { minHeight: 108, padding: 16, gap: 10, borderRadius: r.panel, borderWidth: 1, justifyContent: "space-between" },
  vibeTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  vibeName: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  // Review
  description: { minHeight: 44, flexDirection: "row", gap: 10, paddingVertical: 8, borderRadius: 12 },
  descriptionText: { flex: 1 },
  hint: { fontSize: 12, color: c.muted },
  latest: { gap: 10, padding: 18, borderRadius: r.tile, backgroundColor: c.pinkSoft },
});
