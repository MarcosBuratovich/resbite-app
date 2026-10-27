import React, { useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ticket } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction } from "./ui";
import { CoverCard, StatusCard, StepScreen, useFocusOnChange } from "./kit";
import { categoryPalette, colors as c } from "./tokens";
import { GUEST_COPY, stateSentence } from "../domain/guestAccount";
import { INVITE_COPY } from "../domain/inviteCopy";
import { areaLine, linkPicture } from "../domain/joinView";
import type { CardState, GuestAccount } from "../state/useGuestAccount";

// The open event link signed out (app/invite.tsx, plan 3): the invitation's card, then Sign up to reply or
// I have an account. GI2's Email, Code and Name steps are retired in favour of phone sign-in.

const connectionCopy = "Check your connection and try again.";

/** Signed out: the card and the two ways in; a cancelled, past or turned-off link says so instead. */
export function GuestScreen({ guest, notice }: { guest: GuestAccount; notice?: string | null }) {
  const { card, dead } = guest;
  const heading = useRef<Text>(null);
  const title = dead
    ? stateSentence(dead, card.status === "ready" ? card.value.host : undefined)
    : INVITE_COPY.invitedHeading;
  // VoiceOver focus moves to the new heading when a dead link replaces the invitation.
  useFocusOnChange(heading, title);
  return (
    <StepScreen
      step={null}
      title={title}
      titleRef={heading}
      onClose={guest.close}
      primary={
        dead ? (
          <Button large icon={false} title={GUEST_COPY.goHome} onPress={() => void guest.goHome()} />
        ) : (
          <>
            <Button large icon={false} title={INVITE_COPY.signUpToReply} onPress={guest.signUp} />
            <View style={styles.centerRow}>
              <TextAction title={INVITE_COPY.iHaveAccount} onPress={guest.signIn} />
            </View>
          </>
        )
      }
    >
      {dead ? null : (
        <>
          <InvitationCard card={card} onRetry={() => void guest.retryCard()} />
          <Copy style={styles.helper}>{INVITE_COPY.keptNote}</Copy>
        </>
      )}
      <ErrorNote message={notice ?? null} />
    </StepScreen>
  );
}

/** The card while invitation_page is read: a placeholder, Retry when it couldn't be read, then the event. */
function InvitationCard({ card, onRetry }: { card: CardState; onRetry: () => void }) {
  const tone = categoryPalette.uplifting;
  if (card.status === "loading")
    return (
      <StatusCard icon={Ticket} tint={tone.tint} ink={tone.ink}>
        <ActivityIndicator accessibilityLabel="Loading the invitation" color={c.aquaDark} />
      </StatusCard>
    );
  if (card.status === "failed")
    return (
      <StatusCard icon={Ticket} tint={tone.tint} ink={tone.ink}>
        <Copy style={styles.center}>{connectionCopy}</Copy>
        <TextAction title="Retry" onPress={onRetry} />
      </StatusCard>
    );
  const v = card.value;
  return (
    <LinkCard
      title={v.title}
      startsAt={v.starts_at}
      endsAt={v.ends_at}
      area={v.area}
      host={v.host}
      image={v.image}
    />
  );
}

/**
 * What an open link shows before the host lets someone in (CI-P4): "<Host> invited you", the title, the time,
 * the rough area and the picture. Never the place. Also the waiting screen's card.
 */
export function LinkCard({
  title,
  startsAt,
  endsAt,
  area,
  host,
  image,
}: {
  title?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  area?: string | null;
  host?: string;
  image?: { kind: string; ref: string | null } | null;
}) {
  return (
    <CoverCard
      picture={linkPicture(image)}
      title={title ?? ""}
      startsAt={startsAt || null}
      endsAt={endsAt ?? null}
      place={areaLine(area)}
      byline={INVITE_COPY.invitedYou(host?.trim() || INVITE_COPY.hostFallback)}
      heading={false}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center", color: c.muted },
  helper: { color: c.muted, fontSize: 14 },
  centerRow: { alignItems: "center" },
});
