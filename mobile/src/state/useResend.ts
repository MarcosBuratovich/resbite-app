import { useCallback, useRef, useState } from "react";
import { getRandomBytes } from "expo-crypto";
import { newInviteCode } from "../domain/contactInvites";
import { linkDate } from "../domain/eventLinks";
import { INVITE_COPY } from "../domain/inviteCopy";
import { contactInviteGateway } from "../services/contactInvites";
import { inviteCodeStore } from "../services/inviteCodeStore";
import { putInviteQuietly, sendPersonalLink } from "../services/inviteSend";
import { readProfile } from "../services/profile";
import { useApp } from "./AppState";
import { DEFAULT_ORIGIN } from "./useContactInvites";
import type { InvitedPerson } from "./useEvent";

/**
 * Send again, by the chosen app, to someone invited by personal link who hasn't answered: the stored code, or a
 * fresh one when this phone has none for them (the logic the resbite page held, moved for the people list). The
 * people list offers Send again only where this phone holds the code (`InvitedPerson.stored`, found under the number
 * or another spelling of it). `busy` is the phone being worked on, `error` what went wrong; `reload` runs when a
 * fresh invitation turned out to be something else (an app invitation), so the list is read again. `resend`
 * answers whether the link went out (false: `error` says why).
 */
export function useResend(
  plan: { id: string; title: string; starts_at: string; ends_at?: string | null },
  reload?: () => Promise<void>,
): {
  resend: (person: InvitedPerson, via: "whatsapp" | "messages") => Promise<boolean>;
  /**
   * A host removed this invitation: its stored code (under the key it was found by, and under the number, where Send
   * again records it) and anything minted here are dropped.
   */
  forget: (person: InvitedPerson) => Promise<void>;
  busy: string | null;
  error: string | null;
  clearError: () => void;
} {
  const { session, preview } = useApp();
  const scope = preview ? "preview" : session?.user.id;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Codes made here since the list was read, by number: when WhatsApp won't open, Messages then sends the same new
  // link instead of making another one.
  const minted = useRef<Record<string, NonNullable<InvitedPerson["stored"]>>>({});
  const forget = useCallback(
    async (person: InvitedPerson) => {
      delete minted.current[person.e164];
      if (!scope) return;
      for (const key of new Set([person.storedKey ?? person.e164, person.e164]))
        await inviteCodeStore.remove(scope, plan.id, key).catch(() => {});
    },
    [scope, plan.id],
  );

  const resend = useCallback(
    async (person: InvitedPerson, via: "whatsapp" | "messages") => {
      if (busy || !scope) return false;
      setBusy(person.phone);
      setError(null);
      try {
        const host = await readProfile(scope).then(
          (profile) => profile?.display_name?.trim() || null,
          () => null,
        );
        let saved = person.stored ?? minted.current[person.e164];
        if (!saved) {
          // This phone has no code for them (the host changed phones): a fresh code replaces the old link.
          const code = newInviteCode(getRandomBytes(16));
          const [result] = await contactInviteGateway.invite(plan.id, [
            { phone: person.phone, country: person.country, code },
          ]);
          if (result?.kind !== "link") {
            await reload?.();
            return true;
          }
          saved = { code, name: person.name };
          minted.current[person.e164] = saved;
          await putInviteQuietly(scope, plan.id, person.e164, saved);
        }
        const failure = await sendPersonalLink({
          scope,
          plan: plan.id,
          e164: person.e164,
          name: saved.name,
          code: saved.code,
          via,
          origin: process.env.EXPO_PUBLIC_INVITATION_ORIGIN || DEFAULT_ORIGIN,
          message: {
            host: host ?? INVITE_COPY.hostFallback,
            title: plan.title.trim(),
            when: linkDate(plan.starts_at, plan.ends_at ?? null),
          },
        });
        if (failure) {
          setError(failure);
          return false;
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : INVITE_COPY.offline);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [busy, scope, plan.id, plan.title, plan.starts_at, plan.ends_at, reload],
  );
  const clearError = useCallback(() => setError(null), []);
  return { resend, forget, busy, error, clearError };
}
