import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useApp } from "./AppState";
import { noteLinkOpen, readInvitationPreview, type InvitationPreview } from "../services/guestJoin";
import { isLinkCode } from "../domain/appLinks";

// Signing in remounts every screen (the root Stack is keyed by the account), so the code a signed-out visit
// counted lives outside it: the mount right after signing in from that visit doesn't count the same open again.
let countedSignedOut: string | null = null;

type DeadState = "cancelled" | "happened" | "inactive";
/** The invitation's card: loading, unreadable (offer Retry) or read. */
export type CardState = { status: "loading" } | { status: "failed" } | { status: "ready"; value: InvitationPreview };

/**
 * An event link opened while signed out (plan 3; GI2's email-code guest account is retired). `active` while
 * signed out on a `code` link: the invitation's card from invitation_page, then Sign up to reply (/auth/phone)
 * or I have an account (/auth/phone?intent=signin). The invite screen keeps the code meanwhile; after sign-in
 * /account brings the account back to it once the phone gate is clear, and the signed-in invite screen sends
 * the request. A cancelled, past or turned-off link is refused for good: its sentence shows and the kept code
 * goes.
 */
export function useGuestAccount({ code, token }: { code?: string; token?: string }) {
  const { session, preview, rememberInvite } = useApp();
  // The event link as opened, and that code when well formed.
  const link = !token && code !== undefined && !preview ? code : null;
  const linkCode = isLinkCode(link) ? link : null;
  const active = link !== null && !session;
  const [card, setCard] = useState<CardState>({ status: "loading" });
  const [dead, setDead] = useState<DeadState | null>(null);
  const mounted = useRef(true);
  const counted = useRef<string | null>(null);
  const cardFor = useRef<string | null>(null);
  const remember = useRef(rememberInvite);
  remember.current = rememberInvite;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // One open counted per visit, signed in or not.
  useEffect(() => {
    if (link === null || counted.current === link) return;
    counted.current = link;
    if (session && countedSignedOut === link) {
      countedSignedOut = null;
      return;
    }
    countedSignedOut = session ? null : link;
    void noteLinkOpen(link);
  }, [link]);
  /** Reads the card; a closed state drops the kept code, as a refused request does. */
  const loadCard = useCallback(() => {
    if (link === null) return Promise.resolve();
    cardFor.current = link;
    setCard({ status: "loading" });
    return readInvitationPreview(link).then(
      (value) => {
        if (!mounted.current) return;
        setCard({ status: "ready", value });
        if (value.state !== "open") {
          setDead(value.state);
          if (linkCode) void remember.current(null, linkCode).catch(() => {});
        }
      },
      () => {
        if (mounted.current) setCard({ status: "failed" });
      },
    );
  }, [link, linkCode]);
  useEffect(() => {
    if (active && cardFor.current !== link) void loadCard();
  }, [active, link, loadCard]);

  return {
    active,
    card,
    dead,
    retryCard: loadCard,
    /** Sign-up is /auth/phone's default; the kept code brings the account back here afterwards. */
    signUp: () => router.push("/auth/phone"),
    signIn: () => router.push({ pathname: "/auth/phone", params: { intent: "signin" } }),
    async goHome() {
      if (linkCode) await remember.current(null, linkCode).catch(() => {});
      router.replace("/");
    },
    close() {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    },
  };
}

export type GuestAccount = ReturnType<typeof useGuestAccount>;
