import React, { useEffect, useState, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../src/services/supabase";
import { exchangeAuthCode } from "../../src/services/authCallback";
import { Button, Copy, Title, Field, ErrorNote, s } from "../../src/design/ui";
export default function Callback() {
  const { code, recovery } = useLocalSearchParams<{
      code?: string;
      recovery?: string;
    }>(),
    started = useRef(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [password, setPassword] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code) {
      setError(
        "This confirmation link is incomplete. Please request a new one.",
      );
      return;
    }
    exchangeAuthCode(code)
      .then(() => {
        if (recovery === "1") setReady(true);
        else router.replace("/profile");
      })
      .catch((e) => setError(e.message));
  }, [code, recovery]);
  return (
    <View style={[s.page, s.body, { justifyContent: "center" }]}>
      <Title>
        {ready ? "Choose a new password." : "Confirming your account…"}
      </Title>
      <ErrorNote message={error} />
      {ready ? (
        <>
          <Field
            label="New password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button
            title="Save password"
            onPress={async () => {
              if (password.length < 8) {
                setError("Use at least 8 characters.");
                return;
              }
              const { error } = await supabase.auth.updateUser({ password });
              if (error) setError(error.message);
              else router.replace("/profile");
            }}
          />
        </>
      ) : (
        !error && <ActivityIndicator />
      )}
      {error && (
        <>
          <Copy>Open the link on the same device where you requested it.</Copy>
          <Button
            title="Back to sign in"
            onPress={() => router.replace("/auth")}
          />
        </>
      )}
    </View>
  );
}
