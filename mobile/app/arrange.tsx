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
import { Button, Copy, ErrorNote, TextAction, useLargeText, useReduceMotion, s } from "../src/design/ui";
import { colors as c, fonts, r, space } from "../src/design/tokens";
import { PreviewNotice } from "../src/design/Chrome";
import { Chip, CoverCard, FieldCard, announce, focusHeading } from "../src/design/kit";
import { CoverPicker } from "../src/design/CoverPicker";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { OpenRow, type OpenRowState } from "../src/design/OpenRow";
import { TaskScreen } from "../src/design/TaskScreen";
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

export default function Arrange() {
  const { activity, plan, again } = useLocalSearchParams<{ activity?: string; plan?: string; again?: string }>();
  const form = usePlanForm({ activity, plan, again });
  const reduceMotion = useReduceMotion();
  const largeText = useLargeText();
  const scroll = useRef<ScrollView>(null);
  const itsOnTitle = useRef<Text>(null);
  const positions = useRef<Partial<Record<Block, number>>>({});
  const nameMessage = useRef<Text>(null);
  const categoriesMessage = useRef<Text>(null);
  const whenRow = useRef<View>(null);
  const whereRow = useRef<View>(null);
  const [refusals, setRefusals] = useState(0);
  // Task 8 builds the When and Where sheets; until then these only record that a row was tapped.
  const [, setWhenOpen] = useState(false);
  const [, setWhereOpen] = useState(false);
  // Leaving the It's on! moment: the guard lets go first, then the navigation runs.
  const [leaving, setLeaving] = useState<"later" | "invite" | null>(null);

  const { created, attempted, missing, videoFields, mode } = form;
  const edit = mode === "edit";
  const need = (item: MissingItem) => attempted && missing.includes(item);
  const videoAt = (field: PlanFormField) => videoFields.includes(field);
  const where = form.form.placeTbd ? PLAN_COPY.toBeDecided : form.form.place.trim() || null;
  const when = whenRowText(form.form, form.zone);
  const line = attempted ? missingLine(missing) : null;
  const banner = edit ? notifyBanner(form.notifyCount) : null;
  const full = !validToggle(form.form.categories);

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

  function press() {
    if (missing.length > 0 || videoFields.length > 0) setRefusals((n) => n + 1);
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
    if (!first) return () => cancelAnimationFrame(frame);
    announce(missingLine(missing) ?? "");
    const target = { name: nameMessage, categories: categoriesMessage, when: whenRow, where: whereRow };
    const node = (target as Partial<Record<Block, React.RefObject<View | Text | null>>>)[block]?.current ?? null;
    const timer = setTimeout(() => focusNode(node), Platform.OS === "web" || reduceMotion ? 50 : 350);
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
          <Text
            ref={itsOnTitle}
            accessibilityRole="header"
            style={[styles.itsOn, largeText && { lineHeight: undefined }]}
          >
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
      <TaskScreen
        title={title}
        onClose={close}
        closeLabel={PLAN_COPY.close}
        // The same ref as the form below: the form's ScrollView replaces this one, and the ref must follow it.
        scrollRef={scroll}
        footer={form.loadError ? <Button large icon={false} title={PLAN_COPY.close} onPress={close} /> : null}
      >
        {form.loadError ? <ErrorNote message={form.loadError} /> : <ActivityIndicator color={c.aquaDark} />}
      </TaskScreen>
    );

  const f = form.form;
  const picture = eventPicture({
    activity_id: mode === "idea" ? (activity ?? null) : (form.original?.activity_id ?? null),
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
            <ErrorNote message={form.error} />
            <Button
              large
              icon={false}
              title={button}
              onPress={press}
              loading={form.busy}
              disabled={form.cover.busy || (edit && !form.dirty)}
            />
          </>
        }
      >
        <PreviewNotice dismissible={false} />
        <CoverPicker cover={form.cover} fallback={picture} disabled={form.busy} />
        {banner && (
          <View style={styles.banner}>
            <Copy style={styles.bannerText}>{banner}</Copy>
          </View>
        )}
        <View style={styles.link}>
          <TextAction title={PLAN_COPY.changePhoto} onPress={() => void form.cover.choose()} disabled={form.busy} />
        </View>

        <View onLayout={at("name")} style={styles.block}>
          {need("name") && (
            <Copy ref={nameMessage} style={styles.message}>
              {rowMessage("name")}
            </Copy>
          )}
          <View style={need("name") && styles.red}>
            <FieldCard
              label={PLAN_COPY.namePlaceholder}
              icon={Pencil}
              display
              multiline
              minHeight={64}
              placeholder={PLAN_COPY.namePlaceholder}
              value={f.title}
              onChangeText={(text) => form.set("title", text)}
              maxLength={TITLE_MAX}
              editable={!form.busy}
            />
          </View>
          {videoAt("title") && <ErrorNote message={VIDEO_CALL_MESSAGE} />}
        </View>

        <View onLayout={at("description")} style={styles.block}>
          <FieldCard
            label={PLAN_COPY.descriptionPlaceholder}
            icon={TextAlignStart}
            multiline
            minHeight={64}
            placeholder={PLAN_COPY.descriptionPlaceholder}
            value={f.description}
            onChangeText={(text) => form.set("description", text)}
            maxLength={DESCRIPTION_MAX}
            editable={!form.busy}
          />
          {videoAt("description") && <ErrorNote message={VIDEO_CALL_MESSAGE} />}
        </View>

        <OpenRow
          icon={Calendar}
          label={PLAN_COPY.when}
          placeholder={PLAN_COPY.whenPlaceholder}
          value={when?.line ?? null}
          hint={when?.repeat}
          state={rowState("when", Boolean(when))}
          message={rowMessage("when")}
          accessibilityLabel={`${PLAN_COPY.when}, ${when ? [when.line, when.repeat].filter(Boolean).join(", ") : PLAN_COPY.whenPlaceholder}`}
          rowRef={whenRow}
          onLayout={at("when")}
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
            onPress={() => setWhereOpen(true)}
          />
          {(videoAt("place") || videoAt("area") || videoAt("meetingDetails")) && <ErrorNote message={VIDEO_CALL_MESSAGE} />}
        </View>

        <View onLayout={at("note")} style={styles.block}>
          <FieldCard
            label={PLAN_COPY.notePlaceholder}
            icon={StickyNote}
            multiline
            minHeight={64}
            placeholder={PLAN_COPY.notePlaceholder}
            value={f.guestNote}
            onChangeText={(text) => form.set("guestNote", text)}
            maxLength={GUEST_NOTE_MAX}
            editable={!form.busy}
          />
          {videoAt("guestNote") && <ErrorNote message={VIDEO_CALL_MESSAGE} />}
        </View>

        <View onLayout={at("categories")} style={styles.block}>
          {need("categories") && (
            <Copy ref={categoriesMessage} style={styles.message}>
              {rowMessage("categories")}
            </Copy>
          )}
          <View style={[styles.categories, need("categories") && styles.red]}>
            <Copy accessibilityRole="header" style={styles.categoriesTitle}>
              {PLAN_COPY.categoriesPlaceholder}
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
                    disabled={refused || form.busy}
                    hint={refused ? PLAN_COPY.categoriesFull : undefined}
                    onPress={() => form.set("categories", toggleCategory(f.categories, key))}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </TaskScreen>

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

/** Two categories are chosen: the others are refused (a third tap does nothing). */
function validToggle(categories: readonly string[]) {
  return categories.length < 2;
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  link: { alignSelf: "flex-start" },
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
