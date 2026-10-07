import React from "react";
import { StyleSheet, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { Copy, Field, Title } from "./ui";
import { CategoryChoices } from "./categories";
import { colors as c, fonts } from "./tokens";
import { DESCRIPTION_MAX, TITLE_MAX, type EventFields } from "../domain/events";

/** "What are we doing?" — name, description and one or two categories. */
export function EventDetailsFields({
  value,
  onChange,
  disabled,
  sourceTitle,
}: {
  value: EventFields;
  onChange: (next: EventFields) => void;
  disabled?: boolean;
  sourceTitle?: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Sparkles size={19} color={c.aquaDark} />
        <Title style={styles.title}>What are we doing?</Title>
      </View>
      {sourceTitle ? (
        <Copy style={styles.tag}>From the idea: {sourceTitle}</Copy>
      ) : null}
      <Field
        label="Name"
        placeholder="Dinner at Mario’s, a birthday walk…"
        value={value.title}
        onChangeText={(title) => onChange({ ...value, title })}
        maxLength={TITLE_MAX}
        editable={!disabled}
        returnKeyType="next"
      />
      <Field
        label="Description (optional)"
        placeholder="What you’ll do together"
        value={value.description}
        onChangeText={(description) => onChange({ ...value, description })}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 90 }}
        maxLength={DESCRIPTION_MAX}
        editable={!disabled}
      />
      <View style={{ gap: 8 }}>
        <Copy style={{ fontFamily: fonts.medium, fontSize: 13 }}>Categories</Copy>
        <CategoryChoices
          value={value.categories}
          onChange={(categories) => onChange({ ...value, categories })}
          disabled={disabled}
        />
        <Copy style={styles.hint}>Choose one or two.</Copy>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 24,
    backgroundColor: c.paper,
  },
  heading: { flexDirection: "row", gap: 10, alignItems: "center" },
  title: { fontSize: 23, lineHeight: 30, flexShrink: 1 },
  tag: {
    alignSelf: "flex-start",
    fontSize: 12,
    color: c.aquaDark,
    backgroundColor: c.aquaSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  hint: { fontSize: 12, color: c.muted },
});
