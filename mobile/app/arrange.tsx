import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { MapPin, MessageCircle, CalendarDays } from "lucide-react-native";
import {
  Back,
  Button,
  Copy,
  Title,
  Field,
  ErrorNote,
  useReduceMotion,
  s,
} from "../src/design/ui";
import { PreviewNotice } from "../src/design/Chrome";
import { EventDetailsFields } from "../src/design/EventDetailsFields";
import { EventPictureView } from "../src/design/categories";
import { CoverPicker } from "../src/design/CoverPicker";
import { eventPicture } from "../src/domain/events";
import { PlanSchedule } from "../src/design/PlanSchedule";
import { colors as c } from "../src/design/tokens";
import { usePlanEditor } from "../src/state/usePlanEditor";

export default function Arrange() {
  const { activity, plan: planId } = useLocalSearchParams<{
    activity?: string;
    plan?: string;
  }>();
  const {
    mode,
    preview,
    catalogue,
    idea,
    historicalActivity,
    sourceId,
    ideaBlocked,
    preparing,
    ready,
    retryLoad,
    fields,
    setFields,
    start,
    setStart,
    place,
    changePlace,
    note,
    setNote,
    zone,
    dirty,
    locked,
    busy,
    locating,
    error,
    latest,
    latestEditable,
    pending,
    draftStatus,
    draftError,
    draftRetryLabel,
    cover,
    save,
    locate,
    discardDraft,
    retryDraft,
    applyPlan,
  } = usePlanEditor({ activity, plan: planId });
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.4;
  const scroll = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollToEnd({ animated: !reduceMotion }),
    );
    return () => cancelAnimationFrame(frame);
  }, [error, latest, reduceMotion]);

  if (ideaBlocked)
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          <Back />
          <Title>
            {catalogue.loading
              ? "Checking your activity…"
              : "Activity unavailable"}
          </Title>
          {catalogue.loading ? (
            <ActivityIndicator
              accessibilityLabel="Checking activity"
              color={c.aquaDark}
            />
          ) : (
            <>
              <ErrorNote
                message={
                  catalogue.error ??
                  "This activity is not available to plan right now. Any saved draft stays on this device."
                }
              />
              <Button
                title="Check activity again"
                onPress={catalogue.refresh}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  if (!ready)
    return (
      <SafeAreaView style={s.page}>
        <View style={s.body}>
          <Back />
          <Title>
            {preparing ? "Getting your plan…" : "Let’s take another look."}
          </Title>
          {preparing ? (
            <ActivityIndicator
              accessibilityLabel="Loading plan"
              color={c.aquaDark}
            />
          ) : (
            <>
              <ErrorNote message={error ?? "We couldn’t open this plan. Try again."} />
              {
                <Button
                  title="Try loading again"
                  onPress={retryLoad}
                />
              }
            </>
          )}
        </View>
      </SafeAreaView>
    );
  const saveAction = (
    <View style={[s.actionFooter, largeText && { paddingHorizontal: 0 }]}>
      <Button
        title={
          pending
            ? "Retry save"
            : planId
              ? "Save changes"
              : preview
                ? "Save preview plan"
                : "Save plan"
        }
        onPress={save}
        loading={busy}
        disabled={
          locating ||
          cover.busy ||
          latest !== undefined ||
          (Boolean(planId) && !dirty && !pending)
        }
      />
      <Copy style={{ ...s.muted, fontSize: 11, textAlign: "center" }}>
        {preview
          ? "Preview only · no invitations are sent"
          : planId
            ? "Your changes appear after the save is confirmed"
            : "Invite people after your plan is saved"}
      </Copy>
    </View>
  );
  return (
    <SafeAreaView style={s.page}>
      {!largeText && <PreviewNotice dismissible={false} />}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[s.body, { paddingBottom: 28 }]}
        >
          {largeText && <PreviewNotice dismissible={false} />}
          <Back
            label={planId ? "My resbites" : mode === "idea" ? "Idea" : "Back"}
          />
          <View style={styles.activity}>
            <EventPictureView
              picture={eventPicture({
                activity_id: sourceId,
                categories: fields.categories,
              })}
              size={66}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Copy style={s.muted}>
                {planId ? "YOUR PLAN" : "LET’S GET TOGETHER"}
              </Copy>
              <Title style={{ fontSize: 22, lineHeight: 28 }}>
                {fields.title.trim() || "Your resbite"}
              </Title>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Title>
              {planId ? "A little change of plan." : "Make it a date."}
            </Title>
            <Copy style={s.muted}>
              {planId
                ? "Adjust the details. Existing RSVPs stay as they are."
                : "A time, a place, and something to look forward to."}
            </Copy>
          </View>
          <EventDetailsFields
            value={fields}
            onChange={setFields}
            disabled={locked}
            cover={
              <CoverPicker
                cover={cover}
                disabled={locked}
                fallback={eventPicture({ activity_id: sourceId, categories: fields.categories })}
              />
            }
            sourceTitle={
              sourceId ? (idea?.title ?? historicalActivity?.title) : undefined
            }
          />
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <CalendarDays size={19} color={c.aquaDark} />
              <Title style={styles.sectionTitle}>When works?</Title>
            </View>
            <PlanSchedule value={start} onChange={setStart} disabled={locked} />
            <Copy style={{ ...s.muted, fontSize: 12 }}>
              Times shown in {zone.replaceAll("_", " ")}.
            </Copy>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <MapPin size={19} color={c.aquaDark} />
              <Title style={styles.sectionTitle}>Meet you there.</Title>
            </View>
            <Field
              label="Meeting place"
              placeholder="A café, a park, your place…"
              value={place}
              onChangeText={changePlace}
              maxLength={300}
              editable={!locked}
              returnKeyType="done"
            />
            <Button
              title="Use my location"
              secondary
              icon={false}
              onPress={locate}
              loading={locating}
              disabled={locked}
            />
            <Copy style={s.muted}>
              A name or address is enough. Location is optional.
            </Copy>
          </View>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <MessageCircle size={19} color={c.aquaDark} />
              <Title style={styles.sectionTitle}>One more thing?</Title>
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
          </View>
          <Copy style={s.muted} accessibilityLiveRegion="polite">
            {draftStatus}
          </Copy>
          <ErrorNote message={draftError} />
          {draftError && (
            <Button title={draftRetryLabel} secondary onPress={retryDraft} />
          )}
          <ErrorNote message={error} />
          {latest !== undefined && (
            <View style={[styles.section, { backgroundColor: c.pinkSoft }]}>
              <Title style={styles.sectionTitle}>Latest saved plan</Title>
              {latest ? (
                <>
                  <Copy>{latest.title}</Copy>
                  <Copy>{new Date(latest.starts_at).toLocaleString()}</Copy>
                  <Copy>{latest.place_label}</Copy>
                  <Copy>{latest.note || "No note"}</Copy>
                  {latestEditable ? (
                    <>
                      <Copy style={s.muted}>
                        Using these details replaces your unsaved draft.
                      </Copy>
                      <Button
                        title="Use latest saved details"
                        secondary
                        onPress={() => applyPlan(latest)}
                      />
                    </>
                  ) : (
                    <Copy>This plan is no longer editable.</Copy>
                  )}
                </>
              ) : (
                <Copy>This plan is no longer available to your account.</Copy>
              )}
            </View>
          )}
          {pending && (
            <Copy style={s.muted}>
              The fields are held while the save is unconfirmed, so retrying
              sends exactly the same details.
            </Copy>
          )}
          {!pending && !busy && (
            <Button title="Discard draft" secondary onPress={discardDraft} />
          )}
          {largeText && saveAction}
        </ScrollView>
        {!largeText && saveAction}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  activity: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    gap: 13,
    borderRadius: 24,
    backgroundColor: c.cream,
  },
  section: {
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 24,
    backgroundColor: c.paper,
  },
  sectionHeading: { flexDirection: "row", gap: 10, alignItems: "center" },
  sectionTitle: { fontSize: 23, lineHeight: 30, flexShrink: 1 },
});
