import React, { useState, useRef } from "react";
import { ScrollView, View, Platform } from "react-native";
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
import { validatePlan } from "../src/domain/rules";
export default function Arrange() {
  const { activity } = useLocalSearchParams<{ activity: string }>(),
    a = activities.find((x) => x.id === activity),
    { preview, session, setLocalPlans } = useApp(),
    requestId = useRef(Crypto.randomUUID()),
    [date, setDate] = useState(new Date(Date.now() + 86400000)),
    [show, setShow] = useState<"date" | "time" | null>(null),
    [place, setPlace] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState<string | null>(null);
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
    if (!a) return;
    const invalid = validatePlan(date.toISOString(), place);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    const plan = {
      id: requestId.current,
      activity_id: a.id,
      starts_at: date.toISOString(),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      place_label: place.trim(),
      note,
      status: "active",
      version: 1,
      owner_id: session?.user.id,
    };
    try {
      if (preview) {
        setLocalPlans((p) =>
          p.some((x) => x.id === plan.id) ? p : [plan, ...p],
        );
      } else {
        const { error } = await supabase.rpc("create_plan", {
          p_id: plan.id,
          p_activity: plan.activity_id,
          p_start: plan.starts_at,
          p_zone: plan.time_zone,
          p_place: plan.place_label,
          p_note: note,
        });
        if (error) throw error;
      }
      router.replace({ pathname: "/plans", params: { created: "1" } });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your plan could not be saved. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
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
        <Title>A little plan. A good time.</Title>
        <Copy>
          Choose when and where. You can invite people once your plan is saved.
        </Copy>
        <View style={{ gap: 10 }}>
          <Copy>When</Copy>
          {Platform.OS === "web" ? (
            <>
              <Field
                label="Date and time (local)"
                value={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`}
                onChangeText={(value) => {
                  const d = new Date(value.replace(" ", "T"));
                  if (Number.isFinite(d.getTime())) setDate(d);
                }}
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
          <Copy style={s.muted}>
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Copy>
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
        <Button
          title={preview ? "Save preview plan" : "Save plan"}
          onPress={save}
          loading={busy}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
