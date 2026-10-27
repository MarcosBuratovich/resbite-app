import React from "react";
import type { TextInputProps } from "react-native";
import { Phone } from "lucide-react-native";
import { FieldCard } from "./kit";
import { PHONE_COPY } from "../domain/phoneCopy";

/** The mobile-number input card, shared by sign-up, sign-in and Add your number. */
export function PhoneField(props: Omit<TextInputProps, "style">) {
  return (
    <FieldCard
      label={PHONE_COPY.numberField}
      placeholder={PHONE_COPY.numberField}
      icon={Phone}
      keyboardType="phone-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      {...props}
    />
  );
}
