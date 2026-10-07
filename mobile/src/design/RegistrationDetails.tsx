import React, { useState } from "react";
import { Keyboard, Modal, Platform, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarDays,
  Check,
  Trees,
  Coffee,
  Palette,
  Sparkles,
  BookOpen,
  Users,
} from "lucide-react-native";
import { Button, Copy, Field, ActionRow, TextAction, s } from "./ui";
import { GluestackCheckbox } from "./gluestack";
import { colors as c } from "./tokens";
import {
  registrationInterests,
  type RegistrationDetails as Details,
} from "../domain/registration";
export function RegistrationDetails({
  value,
  onChange,
  step,
  showName = true,
  disabled = false,
}: {
  value: Details;
  onChange: (v: Details) => void;
  step: number;
  showName?: boolean;
  disabled?: boolean;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [candidate, setCandidate] = useState(new Date(2000, 0, 1));
  const set = (key: keyof Details, next: string | string[]) =>
    !disabled && onChange({ ...value, [key]: next });
  const dateText = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const picker = (
    <DateTimePicker
      value={candidate}
      mode="date"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      minimumDate={new Date(1900, 0, 1)}
      maximumDate={new Date()}
      themeVariant="light"
      onDismiss={() => setDateOpen(false)}
      onValueChange={(_, next) => {
        setCandidate(next);
        if (Platform.OS === "android") {
          set("birthDate", dateText(next));
          setDateOpen(false);
        }
      }}
    />
  );
  return (
    <View style={{ gap: 20 }}>
      {step === 0 ? (
        <>
          {showName && (
            <>
              <Field
                editable={!disabled}
                label="Your name"
                value={value.name}
                onChangeText={(v) => set("name", v)}
                autoComplete="name"
                maxLength={80}
                placeholder="What should we call you?"
              />
              <Copy style={{ color: c.muted }}>
                This is the name people will see on your plans.
              </Copy>
            </>
          )}
          {Platform.OS === "web" ? (
            <Field
              editable={!disabled}
              label="Date of birth (optional)"
              value={value.birthDate}
              onChangeText={(v) => set("birthDate", v)}
              placeholder="YYYY-MM-DD"
            />
          ) : (
            <ActionRow
              disabled={disabled}
              title="Date of birth (optional)"
              description={value.birthDate || "Choose your date of birth"}
              icon={CalendarDays}
              onPress={() => {
                Keyboard.dismiss();
                setCandidate(
                  value.birthDate
                    ? new Date(`${value.birthDate}T12:00:00`)
                    : new Date(2000, 0, 1),
                );
                setDateOpen(true);
              }}
            />
          )}
          {Boolean(value.birthDate) && (
            <TextAction
              disabled={disabled}
              title="Clear date of birth"
              onPress={() => set("birthDate", "")}
            />
          )}
          <Copy style={{ color: c.muted, fontSize: 13 }}>
            Date of birth is optional and is not displayed on shared plans.
          </Copy>
        </>
      ) : (
        <>
          <Field
            editable={!disabled}
            label="Phone number (optional)"
            value={value.phone}
            onChangeText={(v) => set("phone", v)}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+44 7700 900123"
            maxLength={30}
          />
          <Copy style={{ color: c.muted, fontSize: 13 }}>
            Include your country code. This does not enable SMS sign-in or send
            invitations.
          </Copy>
          <Field
            editable={!disabled}
            label="City (optional)"
            value={value.city}
            onChangeText={(v) => set("city", v)}
            placeholder="Your city or town"
            maxLength={100}
          />
          <Copy>What do you enjoy? (optional)</Copy>
          <View style={[s.card, { padding: 8, gap: 4 }]}>
            {registrationInterests.map((interest, index) => {
              const selected = value.interests.includes(interest);
              const Icon = [Trees, Coffee, Palette, Sparkles, BookOpen, Users][
                index
              ];
              return (
                <GluestackCheckbox
                  key={interest}
                  value={interest}
                  isChecked={selected}
                  isDisabled={disabled}
                  aria-label={interest}
                  accessibilityLabel={interest}
                  accessibilityState={{ checked: selected, disabled }}
                  onChange={() =>
                    set(
                      "interests",
                      selected
                        ? value.interests.filter((x) => x !== interest)
                        : [...value.interests, interest],
                    )
                  }
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: selected ? c.aquaSoft : c.paper,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Icon size={22} color={c.aquaDark} />
                  <Copy style={{ flex: 1 }}>{interest}</Copy>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      borderWidth: 1,
                      borderColor: selected ? c.aquaDark : c.line,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selected && <Check size={16} color={c.aquaDark} />}
                  </View>
                </GluestackCheckbox>
              );
            })}
          </View>
          <Copy style={{ color: c.muted, fontSize: 13 }}>
            These details stay with your account. Recommendations based on
            interests are not active yet.
          </Copy>
        </>
      )}
      {dateOpen &&
        (Platform.OS === "ios" ? (
          <Modal
            transparent
            animationType="none"
            onRequestClose={() => setDateOpen(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "#34304355",
                justifyContent: "flex-end",
              }}
            >
              <SafeAreaView
                style={{
                  backgroundColor: c.cream,
                  borderTopLeftRadius: 28,
                  borderTopRightRadius: 28,
                }}
              >
                <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
                  <Copy>Date of birth</Copy>
                  {picker}
                  <Button
                    title="Use this date"
                    onPress={() => {
                      set("birthDate", dateText(candidate));
                      setDateOpen(false);
                    }}
                  />
                  <Button
                    title="Cancel"
                    secondary
                    onPress={() => setDateOpen(false)}
                  />
                </ScrollView>
              </SafeAreaView>
            </View>
          </Modal>
        ) : (
          picker
        ))}
    </View>
  );
}
