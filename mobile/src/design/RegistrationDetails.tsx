import React, { useState } from "react";
import { Keyboard, Platform, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  BookOpen,
  CalendarDays,
  Coffee,
  Info,
  MapPin,
  Palette,
  Phone,
  Sparkles,
  Trees,
  UserRound,
  Users,
  X,
} from "lucide-react-native";
import { Button, Copy } from "./ui";
import { Chip, FieldCard, InfoSheet, Row, RowGroup } from "./kit";
import { colors as c, fonts } from "./tokens";
import {
  registrationInterests,
  type RegistrationDetails as Details,
} from "../domain/registration";

const interestIcons = [Trees, Coffee, Palette, Sparkles, BookOpen, Users];

/** The helper lines for a step, word for word (they sit behind "Why we ask" or Account details' ⓘ). */
export function registrationHelp(step: number, showName = true): string[] {
  return step === 0
    ? [
        ...(showName ? ["This is the name people will see on your plans."] : []),
        "Date of birth is optional and is not displayed on shared plans.",
      ]
    : [
        "Include your country code. This does not enable SMS sign-in or send invitations.",
        "These details stay with your account. Recommendations based on interests are not active yet.",
      ];
}

/**
 * Sign-up's first two steps and Account details (UX4): field cards, interest chips and a date
 * sheet. Values, labels and validation are today's; the helper lines are behind "Why we ask"
 * unless the screen shows them itself (`whyWeAsk={false}`).
 */
export function RegistrationDetails({
  value,
  onChange,
  step,
  showName = true,
  disabled = false,
  whyWeAsk = true,
}: {
  value: Details;
  onChange: (v: Details) => void;
  step: number;
  showName?: boolean;
  disabled?: boolean;
  whyWeAsk?: boolean;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [why, setWhy] = useState(false);
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
    <View style={{ gap: 16 }}>
      {step === 0 ? (
        <>
          {showName && (
            <FieldCard
              label="Your name"
              icon={UserRound}
              display
              editable={!disabled}
              value={value.name}
              onChangeText={(v) => set("name", v)}
              autoComplete="name"
              maxLength={80}
              placeholder="What should we call you?"
            />
          )}
          {Platform.OS === "web" ? (
            <FieldCard
              label="Date of birth (optional)"
              icon={CalendarDays}
              editable={!disabled}
              value={value.birthDate}
              onChangeText={(v) => set("birthDate", v)}
              placeholder="YYYY-MM-DD"
            />
          ) : (
            <RowGroup>
              <Row
                title={value.birthDate || "Date of birth"}
                label={value.birthDate ? `Date of birth (optional), ${value.birthDate}` : "Date of birth (optional)"}
                hint="Opens a date picker"
                icon={CalendarDays}
                disabled={disabled}
                onPress={() => {
                  Keyboard.dismiss();
                  setCandidate(value.birthDate ? new Date(`${value.birthDate}T12:00:00`) : new Date(2000, 0, 1));
                  setDateOpen(true);
                }}
              />
            </RowGroup>
          )}
          {Boolean(value.birthDate) && (
            <Chip
              text="Clear date"
              icon={X}
              label="Clear date of birth"
              disabled={disabled}
              onPress={() => set("birthDate", "")}
            />
          )}
        </>
      ) : (
        <>
          <FieldCard
            label="Phone number (optional)"
            icon={Phone}
            editable={!disabled}
            value={value.phone}
            onChangeText={(v) => set("phone", v)}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+44 7700 900123"
            maxLength={30}
          />
          <FieldCard
            label="City (optional)"
            icon={MapPin}
            editable={!disabled}
            value={value.city}
            onChangeText={(v) => set("city", v)}
            placeholder="Your city or town"
            maxLength={100}
          />
          <Copy style={styles.label}>What do you enjoy?</Copy>
          <View style={styles.chips}>
            {registrationInterests.map((interest, index) => {
              const selected = value.interests.includes(interest);
              return (
                <Chip
                  key={interest}
                  text={interest}
                  icon={interestIcons[index]}
                  tone="aqua"
                  selected={selected}
                  disabled={disabled}
                  onPress={() =>
                    set(
                      "interests",
                      selected ? value.interests.filter((x) => x !== interest) : [...value.interests, interest],
                    )
                  }
                />
              );
            })}
          </View>
        </>
      )}
      {whyWeAsk && (
        <Chip text="Why we ask" icon={Info} onPress={() => setWhy(true)} />
      )}
      <InfoSheet visible={why} title="Why we ask" onClose={() => setWhy(false)}>
        {registrationHelp(step, showName).map((line) => (
          <Copy key={line}>{line}</Copy>
        ))}
      </InfoSheet>
      {dateOpen &&
        (Platform.OS === "ios" ? (
          <InfoSheet visible title="Date of birth" onClose={() => setDateOpen(false)}>
            {picker}
            <Button
              title="Use this date"
              onPress={() => {
                set("birthDate", dateText(candidate));
                setDateOpen(false);
              }}
            />
            <Button title="Cancel" secondary onPress={() => setDateOpen(false)} />
          </InfoSheet>
        ) : (
          picker
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.medium, fontSize: 13, color: c.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
