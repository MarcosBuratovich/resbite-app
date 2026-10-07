import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useApp } from "../src/state/AppState";
import { Back, Button, Copy, ErrorNote, Title, s } from "../src/design/ui";
import { canReadSample } from "../src/domain/rsvp";
import { readRsvp } from "../src/services/rsvp";
import { sampleConversation } from "../src/content/sampleConversation";
import { colors } from "../src/design/tokens";
export default function SampleChat() {
  const { plan } = useLocalSearchParams<{ plan?: string }>();
  const { session, preview } = useApp();
  const userId = session?.user.id,
    identity = `${userId}:${preview}:${plan}`;
  const current = useRef(identity);
  current.current = identity;
  const sequence = useRef(0),
    focused = useRef(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = setInterval(() => {
      if (Date.now() >= expiresAt) {
        setAccess(null);
        setError("This plan has started. The sample is no longer available.");
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const [access, setAccess] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    const run = ++sequence.current;
    setAccess(null);
    setExpiresAt(null);
    setError(null);
    setBusy(true);
    const valid = () =>
      focused.current &&
      sequence.current === run &&
      current.current === identity;
    try {
      if (preview) {
        if (valid()) setAccess(identity);
        return;
      }
      if (!userId || !plan)
        throw new Error(
          "Accept an invitation before opening the sample conversation.",
        );
      const snapshot = await readRsvp(plan, userId);
      if (!canReadSample(snapshot))
        throw new Error(
          "The sample is available after an accepted RSVP for a future, active plan.",
        );
      if (valid()) {
        setAccess(identity);
        setExpiresAt(Date.parse(snapshot.plan.starts_at));
      }
    } catch (e) {
      if (valid())
        setError(
          e instanceof Error ? e.message : "Could not check access. Try again.",
        );
    } finally {
      if (valid()) setBusy(false);
    }
  }, [identity, plan, preview, userId]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void check();
      const sub = AppState.addEventListener("change", (state) => {
        setAccess(null);
        ++sequence.current;
        if (state === "active") void check();
      });
      return () => {
        focused.current = false;
        ++sequence.current;
        setAccess(null);
        sub.remove();
      };
    }, [check]),
  );
  return (
    <SafeAreaView style={s.page}>
      <View style={{ paddingHorizontal: 24, paddingTop: 12, gap: 8 }}>
        <Back />
        <Copy accessibilityRole="header" style={{ fontSize: 20 }}>
          Sample conversation
        </Copy>
        <Copy style={{ fontSize: 14 }}>
          Fictional · read-only{preview ? " · design preview" : ""}
        </Copy>
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <Copy>
          These invented names and messages demonstrate the design. They are not
          your guests or a real conversation. Messaging is not available.
        </Copy>
        <ErrorNote message={error} />
        {access === identity ? (
          <>
            {sampleConversation.map((message, index) => (
              <View
                key={message.name + index}
                style={[
                  s.card,
                  {
                    padding: 18,
                    gap: 10,
                    backgroundColor: index % 2 ? colors.aquaSoft : colors.pinkSoft,
                    alignSelf: index % 2 ? "flex-end" : "flex-start",
                    maxWidth: "94%",
                  },
                ]}
              >
                <Copy style={{ fontSize: 13 }}>{message.name}</Copy>
                <Copy>{message.message}</Copy>
              </View>
            ))}
            <Copy>End of fictional sample. There is nothing to send.</Copy>
          </>
        ) : (
          <Button
            title="Check sample access"
            loading={busy}
            onPress={() => void check()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
