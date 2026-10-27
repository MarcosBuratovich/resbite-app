import { Linking, Platform } from "react-native";
import { inviteCodeStore } from "./inviteCodeStore";
import { inviteMessage, personalLink, smsUrl, whatsappAppUrl } from "../domain/contactInvites";
import { INVITE_COPY } from "../domain/inviteCopy";

export type SendVia = "whatsapp" | "messages";

// During sign-out the store refuses writes; the screen is going away, so say nothing.
export async function putInviteQuietly(
  scope: string,
  plan: string,
  e164: string,
  value: Parameters<typeof inviteCodeStore.put>[3],
) {
  try {
    await inviteCodeStore.put(scope, plan, e164, value);
  } catch (e) {
    if (!(e instanceof Error && e.message === "Session changed")) throw e;
  }
}

/**
 * Opens WhatsApp or Messages with a person's personal link, then records which one was used. Returns an
 * error message when it could not be opened (nothing recorded), else null.
 */
export async function sendPersonalLink(a: {
  scope: string;
  plan: string;
  e164: string;
  name: string;
  code: string;
  via: SendVia;
  origin: string;
  message: { host: string; title: string; when: string };
}): Promise<string | null> {
  const text = inviteMessage({ ...a.message, link: personalLink(a.origin, a.code) });
  try {
    if (a.via === "whatsapp") {
      // wa.me never fails (it opens a web page), so only open the app itself, and only when it is there.
      const url = whatsappAppUrl(a.e164, text);
      if (!(await Linking.canOpenURL(url))) return INVITE_COPY.whatsappMissing;
      await Linking.openURL(url);
    } else await Linking.openURL(smsUrl(a.e164, text, Platform.OS));
  } catch {
    return a.via === "whatsapp" ? INVITE_COPY.whatsappMissing : INVITE_COPY.messagesFailed;
  }
  await putInviteQuietly(a.scope, a.plan, a.e164, { code: a.code, name: a.name, sentVia: a.via }).catch(() => {});
  return null;
}
