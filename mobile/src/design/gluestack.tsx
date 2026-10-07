import React, { forwardRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  Platform,
  type PressableProps,
  type ViewProps,
} from "react-native";
import { createButton } from "@gluestack-ui/core/button/creator";
import { createCheckbox } from "@gluestack-ui/core/checkbox/creator";
import { colors } from "./tokens";

// Gluestack's headless components supply interaction/accessibility behavior.
// Local styles keep the Resbite theme and avoid a second styling runtime.
type StateProps = { states?: Record<string, boolean | undefined> };
const ButtonRoot = forwardRef<View, PressableProps & StateProps>(
  function ButtonRoot({ states, style, ...props }, ref) {
    return (
      <Pressable
        {...props}
        ref={ref}
        style={(state) => [
          typeof style === "function" ? style(state) : style,
          states?.focusVisible && {
            borderWidth: 2,
            borderColor: colors.aquaDark,
          },
        ]}
      />
    );
  },
);
const CheckboxRoot = forwardRef<View, PressableProps & StateProps>(
  function CheckboxRoot({ states, style, ...props }, ref) {
    const focus = states?.focusVisible
      ? { borderWidth: 2, borderColor: colors.aquaDark }
      : undefined;
    if (Platform.OS === "web")
      return (
        <View
          {...(props as ViewProps)}
          ref={ref}
          style={[
            typeof style === "function"
              ? style({ pressed: false, hovered: false })
              : style,
            focus,
          ]}
        />
      );
    return (
      <Pressable
        {...props}
        ref={ref}
        style={(state) => [
          typeof style === "function" ? style(state) : style,
          focus,
        ]}
      />
    );
  },
);
const Indicator = forwardRef<View, ViewProps & StateProps>(function Indicator(
  { states, ...props },
  ref,
) {
  return <View {...props} ref={ref} />;
});
export const GluestackButton = createButton({
  Root: ButtonRoot,
  Text,
  Group: View,
  Spinner: ActivityIndicator,
  Icon: View,
});
export const GluestackCheckbox = createCheckbox({
  Root: CheckboxRoot,
  Indicator,
  Icon: View,
  Label: Text,
  Group: View,
});
