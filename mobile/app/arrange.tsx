import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  type LayoutChangeEvent,
  findNodeHandle,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Calendar, MapPin, Pencil, Send, StickyNote, TextAlignStart } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, useReduceMotion, s } from "../src/design/ui";
import { colors as c, fonts, r, space } from "../src/design/tokens";
import { PreviewNotice } from "../src/design/Chrome";
import { Chip, CoverCard, FieldCard, announce, focusHeading } from "../src/design/kit";
import { CoverPicker } from "../src/design/CoverPicker";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { WhenSheet } from "../src/design/WhenSheet";
import { WhereSheet } from "../src/design/WhereSheet";
import { OpenRow, type OpenRowState } from "../src/design/OpenRow";
import { TaskScreen } from "../src/design/TaskScreen";
import { useApp } from "../src/state/AppState";
import { recentPlaces } from "../src/services/recentPlaces";
import { usePlanForm } from "../src/state/usePlanForm";
import { categoryKeys, categoryLabels, toggleCategory } from "../src/domain/categories";
import { DESCRIPTION_MAX, TITLE_MAX, eventPicture } from "../src/domain/events";
import { GUEST_NOTE_MAX } from "../src/domain/eventDetails";
import { coverNotice } from "../src/domain/eventView";
import { PLAN_COPY } from "../src/domain/planCopy";
import { missingLine, notifyBanner, rowMessage, saveLabel, whenRowText, type MissingItem } from "../src/domain/planForm";
import { repeatChoice } from "../src/domain/whenText";
import { VIDEO_CALL_MESSAGE, type PlanFormField } from "../src/domain/videoLinks";

/** The parts of the screen a refused submit can scroll to. */
type Block = "name" | "description" | "when" | "where" | "note" | "categories";
const BLOCK_OF_ITEM: Record<MissingItem, Block> = { name: "name", when: "when", place: "where", categories: "categories" };
const BLOCK_OF_FIELD: Record<PlanFormField, Block> = {
  title: "name",
  description: "description",
  place: "where",
  area: "where",
  meetingDetails: "where",
  guestNote: "note",
};

/**
 * On iOS moving focus interrupts speech, so the row takes focus only after the announced line has
 * been spoken. A first guess: the owner's device check tunes it.
 */
const FOCUS_AFTER_ANNOUNCE_MS = 1200;

/** Moves VoiceOver (native) or keyboard focus (web) to a node. */
function focusNode(node: View | Text | null) {
  if (!node) return;
  if (Platform.OS === "web") {
    const element = node as unknown as HTMLElement;
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    return;
  }
  const handle = findNodeHandle(node);
  if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
}

/**
 * The video-call message under a field. iOS announces it on a refused save and the web's alert role speaks it;
 * on Android a live region speaks what appears in it, so there the wrapper stays mounted, collapsed while empty.
 */
function VideoNote({ show }: { show: boolean }) {
  const note = show ? <ErrorNote message={VIDEO_CALL_MESSAGE} /> : null;
  if (Platform.OS !== "android") return note;
  return (
    <View accessibilityLiveRegion="polite" style={show ? undefined : styles.collapsed}>
      {note}
    </View>
  );
}

/**
 * The small label over a field, as the mockup shows it. The field already carries it as its accessible name, so
 * assistive tech skips this copy and the name is not read twice.
 */
function FieldLabel({ text }: { text: string }) {
  return (
    <Copy aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fieldLabel}>
      {text}
    </Copy>
  );
}

export default function Arrange() {
  const { activity, plan, again } = useLocalSearchParams<{ activity?: string; plan?: string; again?: string }>();
  const form = usePlanForm({ activity, plan, again });
  const reduceMotion = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const itsOnTitle = useRef<Text>(null);
  const positions = useRef<Partial<Record<Block, number>>>({});
  const nameMessage = useRef<Text>(null);
  const categoriesMessage = useRef<Text>(null);
  const whenRow = useRef<View>(null);
  const whereRow = useRef<View>(null);
  const [refusals, setRefusals] = useState(0);
  const [whenOpen, setWhenOpen] = useState(false);
  const [whereOpen, setWhereOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const { preview, session } = useApp();
  const scope = preview ? "preview" : session?.user.id;
  // Leaving the It's on! moment: the guard lets go first, then the navigation runs.
  const [leaving, setLeaving] = useState<"later" | "invite" | null>(null);

  const { created, attempted, missing, videoFields, mode } = form;
  const edit = mode === "edit";
  const need = (item: MissingItem) => attempted && missing.includes(item);
  const videoAt = (field: PlanFormField) => videoFields.includes(field);
  const where = form.form.placeTbd ? PLAN_COPY.toBeDecided : form.form.place.trim() || null;
  const when = whenRowText(form.form, form.zone);
  // After a create with an unknown outcome the footer says so; the form is read-only until Create finds out.
  const line = form.locked ? PLAN_COPY.uncertainCreate : attempted ? missingLine(missing) : null;
  const banner = edit ? notifyBanner(form.notifyCount) : null;
  const full = form.form.categories.length >= 2;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/plans"));
  const later = () => setLeaving((now) => now ?? "later");
  // The Android back button and the swipe also leave through My resbites, never back into the form.
  usePreventRemove(Boolean(created) && leaving === null, later);
  useEffect(() => {
    if (!leaving) return;
    router.dismissTo({
      pathname: "/plans",
      params: { created: "1", cover: form.coverOutcome, notice: Date.now().toString(36) },
    });
    // My resbites first, then invitations on top: Back from invitations lands on My resbites.
    if (leaving === "invite" && created) router.push({ pathname: "/invitations", params: { plan: created.id } });
  }, [leaving]);

  // The discard sheet closes the keyboard; "Keep editing" returns to the same scroll position.
  useEffect(() => {
    if (form.leave.asked) Keyboard.dismiss();
  }, [form.leave.asked]);

  // The moment itself: focus its heading once it has appeared.
  useEffect(() => {
    if (!created) return;
    const frame = requestAnimationFrame(() => focusHeading(itsOnTitle.current));
    return () => cancelAnimationFrame(frame);
  }, [created]);

  function at(block: Block) {
    return (event: LayoutChangeEvent) => {
      positions.current[block] = event.nativeEvent.layout.y;
    };
  }

  // The recent places are read each time the sheet opens; none when they cannot be read.
  function openWhere() {
    setRecent([]);
    setWhereOpen(true);
    if (scope) void recentPlaces.list(scope).then(setRecent, () => setRecent([]));
  }

  function press() {
    const now = form.check();
    if (now.missing.length > 0 || now.videoFields.length > 0) setRefusals((n) => n + 1);
    void form.submit();
  }

  // A refused submit: scroll the first incomplete row under the bar, say what is missing, then
  // move accessibility focus to that row. Video-call links only scroll to their field.
  useEffect(() => {
    if (!refusals) return;
    const first = missing[0];
    const block = first ? BLOCK_OF_ITEM[first] : videoFields[0] ? BLOCK_OF_FIELD[videoFields[0]] : null;
    if (!block) return;
    const y = positions.current[block];
    // On the next frame: the list has finished laying out the rows this refusal just marked.
    const frame = requestAnimationFrame(() => {
      if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: !reduceMotion });
    });
    if (!first) {
      // A video-call link alone: iOS says the message (Android's live region around the note speaks it).
      if (Platform.OS === "ios") announce(VIDEO_CALL_MESSAGE);
      return () => cancelAnimationFrame(frame);
    }
    // Android speaks the footer line through its live region; only iOS needs the explicit announcement.
    // A video-call link as well: its message is queued behind the missing line, so both are heard.
    if (Platform.OS === "ios") {
      announce(missingLine(missing) ?? "");
      if (videoFields.length > 0) announce(VIDEO_CALL_MESSAGE, true);
    }
    const target = { name: nameMessage, categories: categoriesMessage, when: whenRow, where: whereRow };
    const node = (target as Partial<Record<Block, React.RefObject<View | Text | null>>>)[block]?.current ?? null;
    const timer = setTimeout(() => focusNode(node), Platform.OS === "web" ? 50 : FOCUS_AFTER_ANNOUNCE_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [refusals]);

  if (created) {
    const place = created.place_tbd ? PLAN_COPY.placeToBeDecided : created.place_label;
    return (
      <SafeAreaView testID="its-on" style={s.page}>
        <ScrollView contentContainerStyle={styles.moment}>
          <Text ref={itsOnTitle} accessibilityRole="header" style={styles.itsOn}>
            {PLAN_COPY.itsOn}
          </Text>
          <CoverCard
            hero
            heading={false}
            picture={eventPicture({ activity_id: created.activity_id, categories: created.categories })}
            uri={form.cover.uri}
            pictureLabel={form.cover.description}
            title={created.title}
            startsAt={created.starts_at}
            endsAt={created.ends_at ?? null}
            place={place}
            extra={created.repeat_weeks ? repeatChoice(created.repeat_weeks) : undefined}
          />
          <ErrorNote message={coverNotice(form.coverOutcome)} />
          <ErrorNote message={form.error} />
          <Copy style={styles.invite}>{PLAN_COPY.nowInvite}</Copy>
        </ScrollView>
        <View style={styles.momentFooter}>
          <Button
            large
            icon={false}
            mark={Send}
            title={PLAN_COPY.invitePeople}
            onPress={() => setLeaving((now) => now ?? "invite")}
          />
          <TextAction title={PLAN_COPY.notNow} onPress={later} />
        </View>
      </SafeAreaView>
    );
  }

  const title = edit ? PLAN_COPY.editTitle : PLAN_COPY.newTitle;
  if (form.loading || form.loadError)
    return (
      // The same root as the form below (a Fragment), so React keeps the screen and its ScrollView.
      <>
        <TaskScreen
          title={title}
          onClose={close}
          closeLabel={PLAN_COPY.close}
          scrollRef={scroll}
          footer={form.loadError ? <Button large icon={false} title={PLAN_COPY.close} onPress={close} /> : null}
        >
          {form.loadError ? (
            <ErrorNote message={form.loadError} />
          ) : (
            <ActivityIndicator accessibilityLabel={PLAN_COPY.loading} color={c.aquaDark} />
          )}
        </TaskScreen>
      </>
    );

  const f = form.form;
  // Do this again starts on its own, as the created resbite will: no idea's picture.
  const picture = eventPicture({
    activity_id: mode === "idea" ? form.ideaId : edit ? (form.original?.activity_id ?? null) : null,
    categories: f.categories,
  });
  const rowState = (item: MissingItem, filled: boolean): OpenRowState =>
    need(item) ? "missing" : filled ? "filled" : "open";
  const button = edit ? saveLabel(form.notifyCount, form.timeOrPlaceChanged) : PLAN_COPY.create;

  return (
    <>
      <TaskScreen
        title={title}
        onClose={close}
        closeLabel={PLAN_COPY.close}
        line={line}
        scrollRef={scroll}
        footer={
          <>
            <ErrorNote message={form.locked ? null : form.error} />
            <Button
              large
              icon={false}
              title={button}
              onPress={press}
              loading={form.busy}
            />
          </>
        }
      >
        <PreviewNotice dismissible={false} />
        <CoverPicker cover={form.cover} fallback={picture} disabled={form.busy || form.locked} />
        {banner && (
          <View style={styles.banner}>
            <Copy style={styles.bannerText}>{banner}</Copy>
          </View>
        )}
        <View style={styles.link}>
          <TextAction title={PLAN_COPY.changePhoto} onPress={() => void form.cover.choose()} disabled={form.busy || form.locked} />
        </View>

        <View onLayout={at("name")} style={styles.block}>
          {need("name") && (
            <Copy ref={nameMessage} style={styles.message}>
              {rowMessage("name")}
            </Copy>
          )}
          <FieldLabel text={PLAN_COPY.titleLabel} />
          <FieldCard
            error={need("name")}
            label={PLAN_COPY.titleLabel}
            icon={Pencil}
            display
            multiline
            minHeight={64}
            placeholder={PLAN_COPY.namePlaceholder}
            value={f.title}
            onChangeText={(text) => form.set("title", text)}
            maxLength={TITLE_MAX}
            editable={!form.busy && !form.locked}
          />
          <VideoNote show={videoAt("title")} />
        </View>

        <View onLayout={at("description")} style={styles.block}>
          <FieldLabel text={PLAN_COPY.descriptionLabel} />
          <FieldCard
            label={PLAN_COPY.descriptionLabel}
            icon={TextAlignStart}
            multiline
            minHeight={64}
            placeholder={PLAN_COPY.descriptionPlaceholder}
            value={f.description}
            onChangeText={(text) => form.set("description", text)}
            maxLength={DESCRIPTION_MAX}
            editable={!form.busy && !form.locked}
          />
          <VideoNote show={videoAt("description")} />
        </View>

        <OpenRow
          icon={Calendar}
          label={PLAN_COPY.when}
          placeholder={PLAN_COPY.whenPlaceholder}
          value={when?.line ?? null}
          hint={when?.repeat}
          state={rowState("when", Boolean(when))}
          message={form.whenPast ? PLAN_COPY.whenInFuture : rowMessage("when")}
          accessibilityLabel={`${PLAN_COPY.when}, ${when ? [when.line, when.repeat].filter(Boolean).join(", ") : PLAN_COPY.whenPlaceholder}`}
          rowRef={whenRow}
          onLayout={at("when")}
          disabled={form.locked}
          onPress={() => setWhenOpen(true)}
        />
        <View onLayout={at("where")} style={styles.block}>
          <OpenRow
            icon={MapPin}
            label={PLAN_COPY.where}
            placeholder={PLAN_COPY.placePlaceholder}
            value={where}
            state={rowState("place", Boolean(where))}
            message={rowMessage("place")}
            accessibilityLabel={`${PLAN_COPY.where}, ${where ?? PLAN_COPY.placePlaceholder}`}
            rowRef={whereRow}
            disabled={form.locked}
            onPress={openWhere}
          />
          <VideoNote show={videoAt("place") || videoAt("area") || videoAt("meetingDetails")} />
        </View>

        <View onLayout={at("note")} style={styles.block}>
          <FieldLabel text={PLAN_COPY.noteLabel} />
          <FieldCard
            label={PLAN_COPY.noteLabel}
            icon={StickyNote}
            multiline
            minHeight={64}
            placeholder={PLAN_COPY.notePlaceholder}
            value={f.guestNote}
            onChangeText={(text) => form.set("guestNote", text)}
            maxLength={GUEST_NOTE_MAX}
            editable={!form.busy && !form.locked}
          />
          <VideoNote show={videoAt("guestNote")} />
        </View>

        <View onLayout={at("categories")} style={styles.block}>
          {need("categories") && (
            <Copy ref={categoriesMessage} style={styles.message}>
              {rowMessage("categories")}
            </Copy>
          )}
          <View style={[styles.categories, need("categories") && styles.red]}>
            <Copy accessibilityRole="header" style={styles.categoriesTitle}>
              {PLAN_COPY.categoriesLabel}
            </Copy>
            <View style={styles.chips}>
              {categoryKeys.map((key) => {
                const selected = f.categories.includes(key);
                const refused = !selected && full;
                return (
                  <Chip
                    key={key}
                    category={key}
                    text={categoryLabels[key]}
                    selected={selected}
                    disabled={refused || form.busy || form.locked}
                    hint={refused ? PLAN_COPY.categoriesFull : undefined}
                    onPress={() => form.set("categories", toggleCategory(f.categories, key))}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </TaskScreen>

      <WhenSheet
        visible={whenOpen}
        value={{ date: f.date, start: f.start, end: f.end, repeatWeeks: f.repeatWeeks }}
        onDone={(v) => {
          form.patch(v);
          setWhenOpen(false);
        }}
        onClose={() => setWhenOpen(false)}
      />
      <WhereSheet
        visible={whereOpen}
        value={{ place: f.place, placeTbd: f.placeTbd, area: f.area, meetingDetails: f.meetingDetails }}
        recent={recent}
        onDone={(v) => {
          form.patch(v);
          setWhereOpen(false);
        }}
        onClose={() => setWhereOpen(false)}
      />
      <GrabberSheet
        visible={form.leave.asked}
        title={edit ? PLAN_COPY.discardEditTitle : PLAN_COPY.discardCreateTitle}
        onClose={form.leave.keep}
      >
        <Copy>{edit ? PLAN_COPY.discardEditBody : PLAN_COPY.discardCreateBody}</Copy>
        <TextAction destructive title={PLAN_COPY.discard} onPress={form.leave.discard} />
        <Button large icon={false} title={PLAN_COPY.keepEditing} onPress={form.leave.keep} />
      </GrabberSheet>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  // An empty live region takes no room: it gives back the block's gap.
  collapsed: { marginTop: -6 },
  link: { alignSelf: "flex-start" },
  // The kit's small label (the When and Where rows' own).
  fieldLabel: { fontSize: 12, lineHeight: 16, color: c.muted, marginLeft: 4 },
  message: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: c.error, marginLeft: 4 },
  // The missing treatment of a card: a 2 pt error border, the message above it.
  red: { borderWidth: 2, borderColor: c.error, borderRadius: r.panel + 2 },
  banner: { backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  bannerText: { fontSize: 13 },
  categories: { gap: space.m, padding: 4 },
  categoriesTitle: { fontFamily: fonts.bold, fontSize: 17, color: c.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moment: { flexGrow: 1, justifyContent: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 40 },
  itsOn: { fontFamily: fonts.display, fontWeight: "700", fontSize: 36, color: c.ink, textAlign: "center" },
  invite: { textAlign: "center" },
  momentFooter: {
    paddingHorizontal: space.xl,
    paddingTop: space.m,
    paddingBottom: space.l,
    gap: space.s,
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.paper,
  },
});
