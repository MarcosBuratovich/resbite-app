/**
 * Opens a link, or a mailto:, outside the app (Safari or Mail). Never an in-app browser. True when it opened,
 * false when the phone refused or could not.
 */
export async function openExternal(
  url: string,
  open: (url: string) => Promise<unknown> = (target) => {
    // Read only Linking: a namespace import would evaluate React Native's other lazy modules.
    const { Linking } = require("react-native") as typeof import("react-native");
    return Linking.openURL(target);
  },
): Promise<boolean> {
  try {
    await open(url);
    return true;
  } catch {
    return false;
  }
}
