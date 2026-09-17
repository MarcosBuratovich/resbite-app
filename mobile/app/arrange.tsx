import React, { useState, useRef, useEffect, useCallback } from "react";
import { ScrollView, View, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { activities } from "../src/services/catalogue";
import { supabase } from "../src/services/supabase";
import { useApp } from "../src/state/AppState";
import {
  Back,
  Button,
  Copy,
  Title,
  Field,
  ErrorNote,
  s,
} from "../src/design/ui";
import { PreviewNotice } from "../src/design/Chrome";
import {
  canEditPlan,
  preparePlanEdit,
  type PlanRecord,
} from "../src/domain/plans";
import { validatePlan } from "../src/domain/rules";
export default function Arrange() {
  const { activity, edit } = useLocalSearchParams<{
    activity?: string;
    edit?: string;
  }>();
  const { preview, session, localPlans, setLocalPlans } = useApp();
  const requestId = useRef(Crypto.randomUUID()),
    saving = useRef(false);
  const [original, setOriginal] = useState<PlanRecord | null>(null),
    [loading, setLoading] = useState(Boolean(edit)),
    [conflict, setConflict] = useState(false);
  const [date, setDate] = useState(new Date(Date.now() + 86400000)),
    [dateText, setDateText] = useState(""),
    [show, setShow] = useState<"date" | "time" | null>(null),
    [place, setPlace] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState<string | null>(null);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const a = activities.find(
    (x) => x.id === (original?.activity_id || activity),
  );
  const localPlansRef = useRef(localPlans);
  localPlansRef.current = localPlans;
  const initialDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      if (!edit) return;
      setLoading(true);
      setError(null);
      try {
        let found: PlanRecord | null = null;
        if (preview) {
          const p = localPlansRef.current.find((x) => x.id === edit);
          found = p ? { ...p, owner_id: "preview" } : null;
        } else {
          const { data, error } = await supabase
            .from("plans")
            .select("*")
            .eq("id", edit)
            .single();
          if (error) throw error;
          found = data;
        }
        if (
          !found ||
          !canEditPlan(found, preview ? "preview" : session?.user.id || "")
        )
          throw new Error("This plan can no longer be edited.");
        if (!isCurrent()) return;
        setOriginal(found);
        setDate(new Date(found.starts_at));
        setDateText(initialDate(new Date(found.starts_at)));
        setPlace(found.place_label);
        setNote(found.note);
        setConflict(false);
      } catch (e) {
        if (isCurrent()) {
          setOriginal(null);
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load this plan. Try again.",
          );
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [edit, preview, session?.user.id],
  );
  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    if (!edit) setDateText(initialDate(date));
  }, []);
  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted")
        throw new Error(
          "Location is off. You can still enter a meeting place.",
        );
      const p = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [address] = await Location.reverseGeocodeAsync(p.coords);
      setPlace(
        address
          ? [address.name, address.street, address.city]
              .filter(Boolean)
              .join(",")
          : `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not find your location. Enter a meeting place.",
      );
    } finally {
      setLocating(false);
    }
  }
  async function save() {
    if (!a || saving.current || conflict) return;
    const chosen =
      Platform.OS === "web" ? new Date(dateText.replace(" ", "T")) : date;
    const invalid = validatePlan(
      Number.isFinite(chosen.getTime()) ? chosen.toISOString() : "",
      place,
    );
    if (invalid) {
      setError(invalid);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    const draft = {
      starts_at: chosen.toISOString(),
      time_zone:
        original && chosen.getTime() === Date.parse(original.starts_at)
          ? original.time_zone
          : deviceZone,
      place_label: place.trim(),
      note,
    };
    try {
      if (edit && original) {
        const payload = preparePlanEdit(
          original,
          draft,
          preview ? "preview" : session?.user.id || "",
        );
        if (preview) {
          const latest = localPlansRef.current.find((x) => x.id === edit);
          if (
            !latest ||
            latest.version !== original.version ||
            latest.status !== "active"
          ) {
            setConflict(true);
            throw new Error(
              "This plan changed. Reload it before saving again.",
            );
          }
          setLocalPlans((all) =>
            all.map((x) =>
              x.id === edit ? { ...x, ...draft, version: x.version + 1 } : x,
            ),
          );
        } else {
          const { error } = await supabase.rpc("change_plan", payload);
          if (error) {
            if (error.code === "40001") {
              setConflict(true);
              throw new Error(
                "This plan changed elsewhere. Your draft is still here. Reload the latest plan before saving again.",
              );
            }
            throw new Error(error.message);
          }
        }
      } else {
        const plan = {
          id: requestId.current,
          activity_id: a.id,
          ...draft,
          status: "active",
          version: 1,
          owner_id: preview ? "preview" : session?.user.id,
        };
        if (preview)
          setLocalPlans((all) =>
            all.some((x) => x.id === plan.id) ? all : [plan, ...all],
          );
        else {
          const { error } = await supabase.rpc("create_plan", {
            p_id: plan.id,
            p_activity: plan.activity_id,
            p_start: plan.starts_at,
            p_zone: plan.time_zone,
            p_place: plan.place_label,
            p_note: plan.note,
          });
          if (error) throw new Error(error.message);
        }
      }
      router.replace({
        pathname: "/plans",
        params: { saved: edit ? "edited" : "created" },
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your plan could not be saved. Check your connection and try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (edit && (loading || !original))
    return (
      <SafeAreaView style={s.page}>
        <PreviewNotice />
        <View style={s.body}>
          <Back />
          <Title>Edit your plan.</Title>
          {loading ? (
            <ActivityIndicator accessibilityLabel="Loading your plan" />
          ) : (
            <>
              <ErrorNote message={error} />
              <Button title="Try again" onPress={() => void load()} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  if (!a)
    return (
      <SafeAreaView style={s.page}>
        <Back />
        <Copy>Choose an activity first.</Copy>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.page}>
      <PreviewNotice />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.body, { paddingBottom: 36 }]}
      >
        <Back />
        <Copy style={s.muted}>{a.title}</Copy>
        <Title>
          {edit ? "A little change of plan." : "A little plan. A good time."}
        </Title>
        <Copy>
          {edit
            ? "Update the time, meeting place or note. Existing RSVPs are kept."
            : "Choose when and where. You can invite people once your plan is saved."}
        </Copy>
        <View style={{ gap: 10 }}>
          <Copy>When</Copy>
          {Platform.OS === "web" ? (
            <>
              <Field
                label="Date and time (local)"
                value={dateText}
                onChangeText={setDateText}
                editable={!busy}
              />
              <Copy style={s.muted}>
                The mobile build uses the phone’s date and time picker.
              </Copy>
            </>
          ) : (
            <>
              <Button
                secondary
                title={date.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                })}
                onPress={() => setShow("date")}
              />
              <Button
                secondary
                title={date.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                onPress={() => setShow("time")}
              />
              {show && (
                <DateTimePicker
                  value={date}
                  mode={show}
                  minimumDate={new Date()}
                  onChange={(_event, value) => {
                    setShow(null);
                    if (value) setDate(value);
                  }}
                />
              )}
            </>
          )}
          <Copy style={s.muted}>{deviceZone} · times shown on this device</Copy>
        </View>
        <Field
          label="Meeting place"
          placeholder="A café, a park, your place…"
          value={place}
          onChangeText={setPlace}
          maxLength={300}
        />
        <Button
          title="Use my location"
          secondary
          onPress={locate}
          loading={locating}
        />
        <Field
          label="A note for everyone (optional)"
          placeholder="Anything they should know?"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={2000}
        />
        <ErrorNote message={error} />
        {conflict && (
          <>
            <Copy style={s.muted}>
              Reloading replaces the draft above with the latest saved version.
            </Copy>
            <Button
              secondary
              title="Reload latest plan"
              onPress={() => void load()}
            />
          </>
        )}
        <Button
          title={
            edit ? "Save changes" : preview ? "Save preview plan" : "Save plan"
          }
          disabled={conflict || locating}
          onPress={save}
          loading={busy}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
