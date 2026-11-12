import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { useApp } from "./AppState";
import { useFocusedRefresh } from "./useFocusedRefresh";
import { createChatSession, IDLE, listenWith, type ChatSession, type ChatState } from "./chatSession";
import { chatGateway } from "../services/chat";
import { chatQueue } from "../services/chatQueue";
import { supabase } from "../services/supabase";
import { isSeriesId } from "../domain/chatRules";
import type { ChatAudience } from "../domain/chatCopy";

export type Chat = ChatState & {
  /** The page of 100 before the oldest loaded row; `hasEarlier` says whether there is one. */
  loadEarlier: () => Promise<void>;
  /** Earlier pages until the oldest loaded id is at or below `id`, for the pinned card (K-S12). */
  loadUntil: (id: number) => Promise<void>;
  /** Queues and sends a message (K-S7): true once the server has it. Its bubble shows from the call, in `pending`. */
  send: (body: string) => Promise<boolean>;
  announce: (body: string, audience: ChatAudience) => Promise<boolean>;
  /** Sends a failed message again with its own client id. */
  retry: (clientId: string) => Promise<boolean>;
  /** Takes an unsent message off this phone. */
  discard: (clientId: string) => Promise<void>;
  deleteOwn: (id: number) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
  setMute: (muted: boolean) => Promise<boolean>;
  /** Reads the summary and the newest page again, and resends what was left behind ("Try again"). */
  refresh: () => Promise<void>;
  /** Reads the newest page and the summary again and replaces the list (plan 3's block and unblock). */
  replace: () => Promise<void>;
};

const listen = listenWith(supabase);
const nothing = async () => {};
const refused = async () => false;

/**
 * A chat kept current while its screen is focused (K-B1, K-N6): read on focus and on the return to the app, by the
 * Realtime signal of `chat:<series>`, and every 20 seconds while that channel isn't subscribed; marked read after
 * every fetch and on blur (K-S11); its unsent messages kept in the queue and resent (K-S7). The channel goes on blur,
 * sign-out and unmount, and at once on 'Not in this chat' (K-N1). The work is `createChatSession`'s; this wires it to
 * the screen's focus, the app's state and the session. Nothing is read without an account, in the preview, or for a
 * series that isn't one (K-N14).
 */
export function useChat(series: string | undefined): Chat {
  const { session, preview, signingOut, captureSession } = useApp();
  const scope = session?.user.id ?? null;
  const id = isSeriesId(series) ? series : null;
  const ready = scope !== null && id !== null && !preview && !signingOut;
  const [chat, setChat] = useState<ChatSession | null>(null);
  const [state, setState] = useState<ChatState>(IDLE);

  useFocusEffect(useCallback(() => () => chat?.blur(), [chat]));

  useEffect(() => {
    if (!ready || scope === null || id === null) {
      setChat(null);
      setState(IDLE);
      return;
    }
    const assertSession = captureSession();
    const made = createChatSession({
      series: id,
      scope,
      gateway: chatGateway,
      queue: chatQueue,
      listen,
      newId: () => Crypto.randomUUID(),
      current: () => {
        try {
          assertSession();
          return true;
        } catch {
          return false;
        }
      },
      onChange: setState,
    });
    setChat(made);
    setState(made.state());
    // Sign-out, another account, another chat or unmount: blur first, so a chat left while on screen is marked read
    // (the session check stops that write once sign-out began), then the channel and the timers go (H25).
    return () => {
      made.blur();
      made.dispose();
    };
  }, [ready, scope, id, captureSession]);

  // Focus and the return to the app both read and resend; the background stops the poll and the read marks.
  const load = useCallback(async () => chat?.focus(), [chat]);
  const background = useCallback(() => chat?.background(), [chat]);
  useFocusedRefresh(load, { identity: `${scope}:${id}:${preview}`, onBackground: background });

  const actions = useMemo(
    () =>
      chat
        ? {
            loadEarlier: chat.loadEarlier,
            loadUntil: chat.loadUntil,
            send: chat.send,
            announce: chat.announce,
            retry: chat.retry,
            discard: chat.discard,
            deleteOwn: chat.deleteOwn,
            remove: chat.remove,
            setMute: chat.setMute,
            refresh: chat.refresh,
            replace: chat.replace,
          }
        : {
            loadEarlier: nothing,
            loadUntil: nothing,
            send: refused,
            announce: refused,
            retry: refused,
            discard: nothing,
            deleteOwn: refused,
            remove: refused,
            setMute: refused,
            refresh: nothing,
            replace: nothing,
          },
    [chat],
  );
  return { ...state, ...actions };
}
