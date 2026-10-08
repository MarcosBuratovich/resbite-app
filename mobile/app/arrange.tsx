import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Back, Button, ErrorNote, Title, useReduceMotion, s } from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
import { PreviewNotice } from "../src/design/Chrome";
import { StepScreen, announce, focusHeading } from "../src/design/kit";
import {
  DraftProblems,
  InviteNext,
  ReviewStep,
  STEP_HINTS,
  STEP_TITLES,
  VibeStep,
  WhatStep,
  WhenStep,
  WhereStep,
} from "../src/design/PlanSteps";
import { recentPlaces } from "../src/services/recentPlaces";
import { usePlanEditor } from "../src/state/usePlanEditor";
import type { CoverCardPart } from "../src/domain/eventView";
import {
  entryStep,
  firstMissingStep,
  nextStep,
  previousStep,
  stepNumber,
  stepProblem,
  type Step,
  type StepAnswers,
} from "../src/domain/steps";

const partSteps: Record<CoverCardPart, Step> = {
  picture: "what",
  title: "what",
  date: "when",
  place: "where",
  chips: "vibe",
};

export default function Arrange() {
  const { activity, plan: planId } = useLocalSearchParams<{ activity?: string; plan?: string }>();
  const editor = usePlanEditor({ activity, plan: planId });
  const reduceMotion = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const heading = useRef<Text>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  // Set after a Review tap or a Review check: the pill reads "Done" and comes back to Review.
  const [returnTo, setReturnTo] = useState<"review" | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const answers: StepAnswers = { ...editor.fields, start: editor.start, place: editor.place };

  // VoiceOver focus follows the step (and the Invite screen).
  useEffect(() => {
    if (step === null) return;
    const frame = requestAnimationFrame(() => focusHeading(heading.current));
    return () => cancelAnimationFrame(frame);
  }, [step, editor.created]);
  useEffect(() => {
    if (!editor.error && !stepError) return;
    const frame = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: !reduceMotion }));
    return () => cancelAnimationFrame(frame);
  }, [editor.error, editor.latest, stepError, reduceMotion]);
  useEffect(() => {
    if (!editor.scope) return;
    let active = true;
    recentPlaces.list(editor.scope).then(
      (items) => {
        if (active) setRecent(items);
      },
      () => {
        if (active) setRecent([]);
      },
    );
    return () => {
      active = false;
    };
  }, [editor.scope]);

  function go(next: Step, dir: "forward" | "back" = "forward") {
    setDirection(dir);
    setStepError(null);
    setStep(next);
  }
  function fail(at: Step, problem: string) {
    if (at !== step) go(at);
    setStepError(problem);
    announce(problem);
  }
  // Next stays enabled (benchmark row 2): a missing answer shows its message and is announced.
  function advance() {
    if (!step || step === "review") return;
    // An unconfirmed save is retried exactly as journaled (as submit() does), so its locked
    // fields are not re-checked: every step goes straight back to Review, where Retry save is.
    if (editor.pending) {
      setReturnTo(null);
      return go("review");
    }
    const problem = stepProblem(step, answers);
    if (problem) return fail(step, problem);
    if (returnTo === "review") {
      // A jump back that finds another step incomplete goes there and says why.
      const missing = firstMissingStep(answers);
      if (missing && missing !== "review") return fail(missing, stepProblem(missing, answers)!);
      setReturnTo(null);
      return go("review");
    }
    go(nextStep(step));
  }
  function back() {
    const previous = step && previousStep(step);
    if (previous) go(previous, "back");
  }
  function jump(part: CoverCardPart) {
    setReturnTo("review");
    go(partSteps[part]);
  }
  // Review re-checks everything and jumps to the first incomplete step. A pending save
  // is retried exactly as journaled, so it is not re-validated.
  function submit() {
    if (!editor.pending) {
      const missing = firstMissingStep(answers);
      if (missing) {
        setReturnTo("review");
        return fail(missing, stepProblem(missing, answers)!);
      }
    }
    setStepError(null);
    void editor.save();
  }
  const close = () => (router.canGoBack() ? router.back() : router.replace("/plans"));
  const later = () =>
    router.dismissTo({
      pathname: "/plans",
      params: { created: "1", updated: "0", cover: editor.created?.cover ?? "none" },
    });
  // My resbites first (exactly as Later, with its created and cover notices), then invitations
  // on top: Back from invitations always lands on My resbites, however the editor was opened.
  const invite = () => {
    const created = editor.created;
    if (!created) return;
    later();
    router.push({ pathname: "/invitations", params: { plan: created.planId } });
  };

  if (editor.ideaBlocked)
    return (
      <SafeAreaView style={s.page}>
        <ScrollView contentContainerStyle={s.body}>
          <Back />
          <Title>{editor.catalogue.loading ? "Checking your activity…" : "Activity unavailable"}</Title>
          {editor.catalogue.loading ? (
            <ActivityIndicator accessibilityLabel="Checking activity" color={c.aquaDark} />
          ) : (
            <>
              <ErrorNote
                message={
                  editor.catalogue.error ??
                  "This activity is not available to plan right now. Any saved draft stays on this device."
                }
              />
              <Button title="Check activity again" onPress={editor.catalogue.refresh} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  if (!editor.ready)
    return (
      <SafeAreaView style={s.page}>
        <View style={s.body}>
          <Back />
          <Title>{editor.preparing ? "Getting your plan…" : "Let’s take another look."}</Title>
          {editor.preparing ? (
            <ActivityIndicator accessibilityLabel="Loading plan" color={c.aquaDark} />
          ) : (
            <>
              <ErrorNote message={editor.error ?? "We couldn’t open this plan. Try again."} />
              <Button title="Try loading again" onPress={editor.retryLoad} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  if (editor.created)
    return (
      <StepScreen
        step={null}
        title="It’s on!"
        titleRef={heading}
        scrollRef={scroll}
        onClose={later}
        header={<PreviewNotice dismissible={false} />}
        primary={<Button title="Later" secondary icon={false} onPress={later} />}
      >
        <InviteNext editor={editor} onInvite={invite} />
      </StepScreen>
    );
  // The entry step is decided once, when the editor is ready (UX-D3). It is never stored in the draft.
  // `ready` is only true after the restore (or plan or idea load) has finished, so `restored`,
  // `pending` and the answers are final here; a failed or retried load never reaches this line.
  if (step === null) {
    setStep(
      entryStep({ mode: editor.mode, restored: editor.restored, pending: editor.pending !== null, answers }),
    );
    return null;
  }
  const saveTitle = editor.pending
    ? "Retry save"
    : editor.mode === "edit"
      ? editor.preview
        ? "Save preview"
        : "Save"
      : editor.preview
        ? "Create preview"
        : "Create";
  const primary =
    step === "review" ? (
      <Button
        title={saveTitle}
        // The old edit subtitle's meaning, kept as the Save pill's hint (spec "Removed text").
        hint={editor.mode === "edit" ? "Existing RSVPs stay as they are." : undefined}
        onPress={submit}
        loading={editor.busy}
        disabled={
          editor.locating ||
          editor.cover.busy ||
          editor.latest !== undefined ||
          (editor.mode === "edit" && !editor.dirty && !editor.pending)
        }
      />
    ) : (
      <Button title={returnTo === "review" || editor.pending ? "Done" : "Next"} onPress={advance} />
    );
  return (
    <StepScreen
      step={stepNumber(step)}
      title={STEP_TITLES[step]}
      hint={STEP_HINTS[step]}
      titleRef={heading}
      scrollRef={scroll}
      direction={direction}
      onBack={previousStep(step) ? back : undefined}
      onClose={close}
      header={<PreviewNotice dismissible={false} />}
      status={editor.draftStatus}
      primary={primary}
    >
      {step === "what" && <WhatStep editor={editor} />}
      {step === "when" && <WhenStep editor={editor} />}
      {step === "where" && <WhereStep editor={editor} recent={recent} />}
      {step === "vibe" && <VibeStep editor={editor} />}
      {step === "review" && <ReviewStep editor={editor} onJump={jump} />}
      <ErrorNote message={stepError} />
      <DraftProblems editor={editor} />
    </StepScreen>
  );
}
