import { Stack } from "expo-router";
import { useReduceMotion } from "../../src/design/ui";
export default function AuthLayout() {
  const reduce = useReduceMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduce ? "fade" : "slide_from_right",
      }}
    />
  );
}
