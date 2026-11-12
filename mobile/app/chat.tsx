import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
  type ListRenderItem,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowUp, Bell, BellOff, ChevronRight, Ellipsis, Trash2, UserPlus, Users } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, s, useLargeText, useReduceMotion } from "../src/design/ui";
import { Chip, IconButton, focusHeading } from "../src/design/kit";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { MenuRow } from "../src/design/MenuRow";
import { colors as c, depth, fonts, space } from "../src/design/tokens";
import { CHAT_COPY, type ChatAudience } from "../src/domain/chatCopy";
import {
  canAnnounce,
  closedCard,
  closingLine,
  defaultAudience,
  fitEdit,
  hasVisibleText,
  headerLine,
  isSeriesId,
  linkHost,
  linkParts,
  messageLabel,
  phoneZone,
} from "../src/domain/chatRules";
import { EVENT_COPY } from "../src/domain/eventPage";
import type { ChatSummary } from "../src/services/chat";
import { useApp } from "../src/state/AppState";
import { useChat, type Chat } from "../src/state/useChat";
import { withEndedLine, withPending } from "../src/state/chatModel";
import { chatFeed, nothingSaid, type FeedLink, type FeedRow, type MessageAction } from "../src/state/chatFeed";
import { dismissed, holdError, heldUntil, type HeldError } from "../src/state/heldError";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The field grows with the text up to about five lines, then scrolls (rule 9). */
const FIELD_MIN = 44;
const FIELD_MAX = 124;
const FIELD_MAX_LARGE = 200;
/**
 * A pinned jump steps toward its row and tries again until the list has laid it out. It keeps going while each step
 * gets further, gives up after this many steps that don't, and after this long in all.
 */
const JUMP_STEP_MS = 150;
const JUMP_STALLS = 10;
const JUMP_GIVE_UP_MS = 20_000;
/** A long-press, on a bubble and on a link inside it alike (H35). */
const LONG_PRESS_MS = 400;

const ACTION_LABEL: Record<MessageAction, string> = {
  delete: CHAT_COPY.deleteMine,
  remove: CHAT_COPY.removeTheirs,
  deleteUnsent: CHAT_COPY.deleteUnsent,
};

/**
 * A bubble's text keeps its own direction, so a message's bidi can't flip what's around it: `writingDirection: "auto"`
 * on iOS (the paragraph takes its first strong character), and on the web every root Text is already `dir="auto"`,
 * an isolate.
 */
const ownDirection: TextStyle | null = Platform.OS === "ios" ? { writingDirection: "auto" } : null;
/** A host longer than the line breaks anywhere, so the end of it, the site that opens, always shows (H32 12). */
const breakAnywhere = (Platform.OS === "web" ? { wordBreak: "break-word" } : null) as TextStyle | null;

// Browser QA can stand in for the keyboard with ?keyboard=1 (development web builds only), as ?largeText=1 does for
// Larger Text: the web has no keyboard events.
const forcedKeyboard =
  __DEV__ && Platform.OS === "web" && typeof location !== "undefined" && new URLSearchParams(location.search).has("keyboard");

/** The keyboard is up: the composer pads 8 under the field, and the chrome above the list gives way (K-S15, H32 52). */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(forcedKeyboard);
  useEffect(() => {
    if (forcedKeyboard) return;
    const ios = Platform.OS === "ios";
    const up = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () => setShown(true));
    const down = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setShown(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  return shown;
}

/**
 * Redraws when the closing line's floored count changes, and at least each minute (CH-P15). It counts against the
 * server's clock (H29), with no animation, so Reduce Motion has nothing to stop.
 */
function useMinuteTick(closesAt: string | null, serverNow: () => number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const left = closesAt ? Date.parse(closesAt) - serverNow() : NaN;
    const toNext = left > 0 ? (left > HOUR ? left % HOUR : left % MINUTE) + 50 : MINUTE;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.min(Math.max(toNext, 250), MINUTE));
    return () => clearTimeout(timer);
  }, [closesAt, serverNow, tick]);
  return tick;
}

/** The notice when text was left out: a live region on Android, said aloud on iOS (H35). */
function sayTooLong() {
  if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(CHAT_COPY.tooLong);
}

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

type ActionSheet = { key: string; view: "menu" | "delete" | "remove"; direct: boolean };

/**
 * The chat (CH-02 to CH-08): /chat?series=<series id>. The header with the date and the going count, the pinned
 * announcement, the closing line, the feed (an inverted list, newest at the bottom) and the composer, or the closed card
 * once `summary.open` says so. A series that isn't one calls nothing (K-N14). One title bar for the whole visit, so its
 * heading is focused once (H31).
 */
export default function ChatScreen() {
  const { series } = useLocalSearchParams<{ series?: string }>();
  const valid = isSeriesId(series);
  const chat = useChat(valid ? series : undefined);
  const keyboard = useKeyboardShown();
  const [menuOpen, setMenuOpen] = useState(false);
  const summary = chat.summary;
  const tick = useMinuteTick(summary?.closesAt ?? null, chat.serverNow);
  const now = useMemo(() => chat.serverNow(), [chat.serverNow, tick, chat.messages, chat.pending, summary]);
  const out = !valid || (!summary && chat.error === CHAT_COPY.notInChat);
  return (
    <View style={s.page}>
      <Bar
        title={summary?.title || CHAT_COPY.chat}
        line={summary ? headerLine(summary, now) : null}
        planId={summary?.planId}
        compact={keyboard}
        onMore={summary && !out ? () => setMenuOpen(true) : undefined}
      />
      {out ? (
        <View style={styles.notice}>
          <Copy>{CHAT_COPY.notInChat}</Copy>
        </View>
      ) : !summary ? (
        <Loading chat={chat} />
      ) : (
        <Conversation
          chat={chat}
          summary={summary}
          now={now}
          keyboard={keyboard}
          menuOpen={menuOpen}
          onMenu={setMenuOpen}
        />
      )}
    </View>
  );
}

function Loading({ chat }: { chat: Chat }) {
  return (
    <View style={styles.notice}>
      <ErrorNote message={chat.error} />
      {chat.error ? (
        <Button icon={false} secondary title={EVENT_COPY.tryAgain} disabled={chat.busy} onPress={() => void chat.refresh()} />
      ) : (
        <ActivityIndicator accessibilityLabel={CHAT_COPY.chat} color={c.aquaDark} />
      )}
    </View>
  );
}

/** The title bar, as the people list's: Back, the resbite's title with its second line, and ••• for the menu. */
function Bar({
  title,
  line,
  onMore,
  planId,
  compact,
}: {
  title: string;
  line?: string | null;
  onMore?: () => void;
  planId?: string;
  /** The keyboard is up: the title keeps to one line. */
  compact: boolean;
}) {
  const insets = useSafeAreaInsets();
  const largeText = useLargeText();
  const heading = useRef<Text | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusHeading(heading.current));
    return () => cancelAnimationFrame(frame);
  }, []);
  const back = () => {
    if (router.canGoBack()) router.back();
    else if (planId) router.replace({ pathname: "/event", params: { plan: planId } });
    else router.replace("/plans");
  };
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.s }]}>
      <IconButton icon={ArrowLeft} label={EVENT_COPY.back} onPress={back} />
      <View style={styles.barText}>
        <Text
          ref={heading}
          accessibilityRole="header"
          numberOfLines={largeText && !compact ? undefined : 1}
          style={[styles.barTitle, !largeText && styles.barTitleLine]}
        >
          {title}
        </Text>
        {/* Hidden when the summary can't give it (H20). */}
        {line ? <Text style={[styles.barLine, !largeText && styles.barLineHeight]}>{line}</Text> : null}
      </View>
      {onMore ? <IconButton icon={Ellipsis} label={EVENT_COPY.moreButton} tone="plain" onPress={onMore} /> : <View style={styles.barSpacer} />}
    </View>
  );
}

function Conversation({
  chat,
  summary,
  now,
  keyboard,
  menuOpen,
  onMenu,
}: {
  chat: Chat;
  summary: ChatSummary;
  now: number;
  keyboard: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}) {
  const viewerId = useApp().session?.user.id ?? "";
  const largeText = useLargeText();
  const reduce = useReduceMotion();
  const mounted = useMounted();
  const zone = useMemo(phoneZone, []);
  const open = summary.open;

  const [draft, setDraft] = useState("");
  // What Send reads: two presses before a redraw still send once (H32 Q27).
  const draftRef = useRef("");
  const [cut, setCut] = useState(false);
  // The announcement's words live here, so they outlive the sheet and show under the closed card (H35).
  const [announceBody, setAnnounceBody] = useState("");
  const [sheet, setSheet] = useState<ActionSheet | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [link, setLink] = useState<{ href: string; host: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const loadingRef = useRef(false);
  const question = useRef<Text | null>(null);
  const firstMenuRow = useRef<View | null>(null);

  // The list: rows, the ended line and the unsent messages, worded, oldest first; reversed for the inverted list.
  const rows = useMemo(
    () =>
      chatFeed(withEndedLine(withPending(chat.messages, chat.pending), summary, chat.hasEarlier, now), {
        names: chat.names,
        viewerId,
        now,
        zone,
        title: summary.title,
        host: summary.host,
        closed: !open,
      }),
    [chat.messages, chat.pending, chat.names, chat.hasEarlier, summary, now, viewerId, zone, open],
  );
  const data = useMemo(() => [...rows].reverse(), [rows]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const editDraft = useCallback((text: string) => {
    const fit = fitEdit(draftRef.current, text);
    if (fit.cut) sayTooLong();
    draftRef.current = fit.text;
    setDraft(fit.text);
    setCut(fit.cut);
  }, []);

  // The pinned card loads earlier pages until its row is in the list, then scrolls there. A row the list hasn't laid
  // out yet is gone near, and tried again until it has; its own layout makes the last, exact jump (K-S12, H32 22).
  const list = useRef<FlatList<FeedRow>>(null);
  const latest = useRef(data);
  latest.current = data;
  const jump = useRef<{ key: string; loaded: boolean; furthest: number; stalls: number } | null>(null);
  // Set by onScrollToIndexFailed, which the list calls during scrollToIndex when it can't place the row.
  const missed = useRef(false);
  const tryJump = useCallback(() => {
    const j = jump.current;
    if (!j) return;
    const index = latest.current.findIndex((r) => r.key === j.key);
    if (index < 0) {
      if (j.loaded) jump.current = null;
      return;
    }
    missed.current = false;
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: !reduce });
    // It landed: the jump is over, so nothing later (a send, a message arriving) pulls the list back to it (H35 I1).
    if (!missed.current && jump.current === j) jump.current = null;
  }, [reduce]);
  useEffect(tryJump, [data, tryJump]);
  const pinned = summary.pinned;
  const pinnedLabel = pinned ? messageLabel(pinned, chat.names, viewerId, now, zone) : null;
  const jumpToPinned = async () => {
    if (!pinned) return;
    const key = `m:${pinned.id}`;
    const mine = { key, loaded: false, furthest: -1, stalls: 0 };
    jump.current = mine;
    tryJump();
    await chat.loadUntil(pinned.id);
    if (!mounted.current || jump.current !== mine) return;
    // Every page it needs has loaded (or one failed): it jumps if its row is there, and is cleared either way (H31).
    mine.loaded = true;
    requestAnimationFrame(tryJump);
    setTimeout(() => {
      if (jump.current === mine) jump.current = null;
    }, JUMP_GIVE_UP_MS);
  };
  // Not measured yet. The list renders a batch at a time, so the step goes to the furthest row it has measured (an
  // exact place), and the rows beyond lay out for the next try; with nothing measured, near it by the average.
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number; highestMeasuredFrameIndex: number }) => {
      missed.current = true;
      if (info.highestMeasuredFrameIndex > 0)
        list.current?.scrollToIndex({ index: info.highestMeasuredFrameIndex, viewPosition: 0.5, animated: false });
      else list.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: false });
      const j = jump.current;
      if (!j) return;
      if (info.highestMeasuredFrameIndex > j.furthest) {
        j.furthest = info.highestMeasuredFrameIndex;
        j.stalls = 0;
      } else if (++j.stalls >= JUMP_STALLS) {
        jump.current = null;
        return;
      }
      setTimeout(tryJump, JUMP_STEP_MS);
    },
    [tryJump],
  );
  // The target laid out: the list can now measure it, so the next try is exact. The jump stays armed until a try needs
  // no correction, its tries run out, its time does, or the person drags the list.
  const onRowLayout = useCallback(
    (key: string) => {
      if (jump.current?.key === key) requestAnimationFrame(tryJump);
    },
    [tryJump],
  );
  const onScrollBeginDrag = useCallback(() => {
    jump.current = null;
  }, []);

  // While the keyboard is up the field stays above it: the closing line hides and the pinned card keeps to one line
  // (H32 52).
  const closing = open && !keyboard ? closingLine(summary.closesAt, now, summary.timeZone) : null;
  // The closed card says why, so its own refusal isn't repeated above.
  const incoming = chat.error && !(chat.error === CHAT_COPY.closedShort && !open) ? chat.error : null;
  // Once shown, an error stays at least 4 s; one that comes while the link sheet (no place for it) is open waits for the
  // band (H35). Every other sheet shows it.
  const [held, setHeld] = useState<HeldError>(null);
  const showing = link === null;
  useEffect(() => setHeld((h) => holdError(h, incoming, showing, Date.now())), [incoming, showing]);
  useEffect(() => {
    const until = incoming === null ? heldUntil(held) : null;
    if (until === null) return;
    const timer = setTimeout(() => setHeld((h) => holdError(h, null, true, Date.now())), Math.max(0, until - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [held, incoming]);
  const shownError = held?.message ?? null;
  // Cancel, Keep or closing a sheet: what was shown goes, never what wasn't yet (H35).
  const dismissError = () => {
    if (dismissed(held) !== null) return;
    setHeld(null);
    chat.clearError();
  };

  // At the close the card takes the field's place; VoiceOver says so, and nothing moves focus (K-S10, H31).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      setAnnouncing(false);
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(closedCard(summary, now).line);
    }
    wasOpen.current = open;
    // Only the moment it closes.
  }, [open]);

  const askLink = useCallback((href: string) => {
    const host = linkHost(href);
    if (host) setLink({ href, host });
  }, []);
  const openActions = useCallback((key: string, view: ActionSheet["view"] = "menu") => {
    setSheet({ key, view, direct: view !== "menu" });
  }, []);
  const onAction = useCallback(
    (row: FeedRow, name: string) => {
      if (name === "delete" || name === "remove") return openActions(row.key, name);
      if (name === "deleteUnsent" && row.type === "pending") return void chat.discard(row.clientId);
      if (row.type === "bubble" || row.type === "announcement") {
        const href = row.links.find((l) => l.name === name)?.href;
        if (href) askLink(href);
      }
    },
    [askLink, chat.discard, openActions],
  );

  const renderItem: ListRenderItem<FeedRow> = useCallback(
    ({ item }) => (
      <Row
        row={item}
        onLayout={onRowLayout}
        planId={summary.planId}
        largeText={largeText}
        onLink={askLink}
        onActions={openActions}
        onAction={onAction}
        onRetry={chat.retry}
      />
    ),
    [summary.planId, largeText, askLink, openActions, onAction, chat.retry, onRowLayout],
  );

  // Earlier pages: a spinner only while one loads; a failed one offers Try again (H31, H32 24).
  const hasEarlier = chat.hasEarlier;
  const loadEarlier = chat.loadEarlier;
  const earlier = useCallback(async () => {
    if (!hasEarlier || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingEarlier(true);
    try {
      await loadEarlier();
    } finally {
      loadingRef.current = false;
      if (mounted.current) setLoadingEarlier(false);
    }
  }, [hasEarlier, loadEarlier, mounted]);
  const earlierFailed = chat.earlierFailed;
  const onEndReached = useCallback(() => {
    if (!earlierFailed) void earlier();
  }, [earlier, earlierFailed]);
  const keyOf = useCallback((r: FeedRow) => r.key, []);

  // Do this again: the plan screen on a copy of this resbite (H12), one at a time.
  const againOpen = useRef(false);
  const again = () => {
    if (againOpen.current) return;
    againOpen.current = true;
    router.push({ pathname: "/arrange", params: { again: summary.planId } });
    setTimeout(() => (againOpen.current = false), 1000);
  };
  const send = () => {
    const body = draftRef.current;
    if (!hasVisibleText(body)) return;
    // A send goes to the newest: a pinned jump still under way stops here (H35 I1).
    jump.current = null;
    draftRef.current = "";
    setDraft("");
    setCut(false);
    void chat.send(body);
    // The message shows where the newest are, whatever was being read (H32 20).
    list.current?.scrollToOffset({ offset: 0, animated: !reduce });
  };

  const target = sheet ? byKey.get(sheet.key) : undefined;
  const targetActions = target && "actions" in target ? target.actions : [];
  // The row changed under the sheet (taken down elsewhere, or sent): nothing left to offer.
  useEffect(() => {
    if (sheet && targetActions.length === 0) setSheet(null);
  }, [sheet, targetActions.length]);
  // The sheet's next view takes focus: the question after Delete or Remove, the menu again after Keep (H32 Q53).
  useEffect(() => {
    if (!sheet) return;
    const frame = requestAnimationFrame(() =>
      sheet.view === "menu" ? (sheet.direct ? undefined : focusHeading(firstMenuRow.current)) : focusHeading(question.current),
    );
    return () => cancelAnimationFrame(frame);
  }, [sheet]);
  const closeSheet = () => {
    setSheet(null);
    dismissError();
  };
  const takeDown = async (kind: "delete" | "remove") => {
    if (!target || (target.type !== "bubble" && target.type !== "announcement")) return;
    setWorking(true);
    const done = kind === "delete" ? await chat.deleteOwn(target.message.id) : await chat.remove(target.message.id);
    if (!mounted.current) return;
    setWorking(false);
    if (done) setSheet(null);
  };
  const mute = async () => {
    setWorking(true);
    const done = await chat.setMute(!summary.mutedChat);
    if (!mounted.current) return;
    setWorking(false);
    if (done) onMenu(false);
  };

  const said = !nothingSaid(rows);
  const emptyBlock = said ? null : (
    <EmptyState host={summary.host && summary.accepted === 0} open={open} planId={summary.planId} />
  );
  return (
    <>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        {pinned && pinnedLabel && pinned.body ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${CHAT_COPY.pinned}, ${pinnedLabel}`}
            onPress={() => void jumpToPinned()}
            style={({ pressed }) => [styles.pinned, pressed && styles.pressed]}
          >
            <Text style={styles.pinnedKey}>{CHAT_COPY.pinned}</Text>
            <Text numberOfLines={largeText && !keyboard ? 3 : 1} style={[styles.pinnedText, ownDirection]}>
              {pinned.body}
            </Text>
            <ChevronRight size={18} color={c.muted} />
          </Pressable>
        ) : null}
        {closing ? <Text style={styles.closing}>{closing}</Text> : null}
        {/* A sheet that is open says it there: one alert, not two. */}
        {shownError && showing && !menuOpen && !sheet && !announcing ? (
          <View style={styles.errorBand}>
            <ErrorNote message={shownError} />
          </View>
        ) : null}
        {rows.length === 0 ? (
          <View style={styles.empty}>{emptyBlock}</View>
        ) : (
          <FlatList
            ref={list}
            data={data}
            inverted
            keyExtractor={keyOf}
            renderItem={renderItem}
            contentContainerStyle={styles.feed}
            keyboardShouldPersistTaps="handled"
            // Android has no interactive dismissal (H31).
            keyboardDismissMode={Platform.OS === "android" ? "on-drag" : "interactive"}
            // An incoming message doesn't move what someone is reading; at the bottom, it comes into view (K-S15).
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            onScrollToIndexFailed={onScrollToIndexFailed}
            onScrollBeginDrag={onScrollBeginDrag}
            // Only Resbite's lines so far: the empty state sits under them, at the bottom (H31 Q3).
            ListHeaderComponent={emptyBlock ? <View style={styles.emptyUnder}>{emptyBlock}</View> : null}
            ListFooterComponent={
              loadingEarlier ? (
                <ActivityIndicator accessibilityLabel={CHAT_COPY.loadingEarlier} style={styles.earlier} color={c.aquaDark} />
              ) : earlierFailed && hasEarlier ? (
                <View style={styles.earlier}>
                  <TextAction title={EVENT_COPY.tryAgain} onPress={() => void earlier()} />
                </View>
              ) : null
            }
          />
        )}
        {open ? (
          <Composer
            summary={summary}
            draft={draft}
            cut={cut}
            keyboard={keyboard}
            onDraft={editDraft}
            onSend={send}
            onAnnounce={() => setAnnouncing(true)}
          />
        ) : (
          <ClosedCard summary={summary} now={now} drafts={[draft, announceBody]} onAgain={again} />
        )}
      </KeyboardAvoidingView>

      <GrabberSheet
        visible={menuOpen}
        label={EVENT_COPY.moreButton}
        onClose={() => {
          onMenu(false);
          dismissError();
        }}
      >
        <View>
          <MenuRow
            title={CHAT_COPY.peopleInChat(summary.members)}
            icon={Users}
            onPress={() => {
              onMenu(false);
              router.push({ pathname: "/guests", params: { plan: summary.planId } });
            }}
          />
          <MenuRow
            title={summary.mutedChat ? CHAT_COPY.unmute : CHAT_COPY.mute}
            hint={summary.mutedChat ? undefined : CHAT_COPY.muteHint}
            icon={summary.mutedChat ? Bell : BellOff}
            busy={working}
            onPress={() => void mute()}
          />
        </View>
        <ErrorNote message={menuOpen ? shownError : null} />
      </GrabberSheet>

      <GrabberSheet visible={sheet !== null && target !== undefined} label={target && "label" in target ? target.label : undefined} onClose={closeSheet}>
        {sheet && target ? (
          sheet.view === "menu" ? (
            <View>
              {targetActions.map((action, i) => (
                <MenuRow
                  key={action}
                  ref={i === 0 ? firstMenuRow : undefined}
                  title={ACTION_LABEL[action]}
                  icon={Trash2}
                  destructive
                  disabled={working}
                  onPress={() => {
                    if (action === "deleteUnsent" && target.type === "pending") {
                      setSheet(null);
                      void chat.discard(target.clientId);
                    } else if (action !== "deleteUnsent") setSheet({ ...sheet, view: action });
                  }}
                />
              ))}
              <ErrorNote message={shownError} />
            </View>
          ) : (
            <View style={styles.question}>
              <Copy ref={question} accessibilityRole="header" style={styles.questionText}>
                {sheet.view === "delete" ? CHAT_COPY.deleteQuestion : CHAT_COPY.removeQuestion}
              </Copy>
              <Button
                icon={false}
                destructive
                title={sheet.view === "delete" ? CHAT_COPY.deleteMine : CHAT_COPY.removeTheirs}
                loading={working}
                disabled={working}
                onPress={() => void takeDown(sheet.view === "delete" ? "delete" : "remove")}
              />
              <Button
                icon={false}
                secondary
                title={CHAT_COPY.keep}
                disabled={working}
                onPress={() => {
                  dismissError();
                  setSheet(sheet.direct ? null : { ...sheet, view: "menu" });
                }}
              />
              <ErrorNote message={shownError} />
            </View>
          )
        ) : null}
      </GrabberSheet>

      <AnnounceSheet
        visible={announcing}
        chat={chat}
        summary={summary}
        body={announceBody}
        onBody={setAnnounceBody}
        error={announcing ? shownError : null}
        onCancel={() => {
          setAnnouncing(false);
          dismissError();
        }}
        onSent={() => setAnnouncing(false)}
      />

      <GrabberSheet
        visible={link !== null}
        label={link ? CHAT_COPY.openQuestion(link.host) : undefined}
        onClose={() => setLink(null)}
      >
        <View style={styles.question}>
          <Text accessibilityRole="header" style={[styles.linkQuestion, breakAnywhere]}>
            {link ? CHAT_COPY.openQuestion(link.host) : ""}
          </Text>
          <Button
            icon={false}
            title={CHAT_COPY.open}
            onPress={() => {
              const href = link?.href;
              setLink(null);
              if (href) void Linking.openURL(href).catch(() => {});
            }}
          />
          <Button icon={false} secondary title={CHAT_COPY.cancel} onPress={() => setLink(null)} />
        </View>
      </GrabberSheet>
    </>
  );
}

/** Nothing said yet (CH-07): the host's invitation to invite, anyone else's "No messages yet". */
function EmptyState({ host, open, planId }: { host: boolean; open: boolean; planId: string }) {
  if (!host) return <Copy style={styles.emptyHint}>{CHAT_COPY.noMessages}</Copy>;
  return (
    <View style={styles.emptyBlock}>
      <Text accessibilityRole="header" style={styles.emptyTitle}>
        {CHAT_COPY.nobodyGoing}
      </Text>
      <Copy style={styles.emptyHint}>{CHAT_COPY.nobodyGoingHint}</Copy>
      {open ? (
        <Chip
          text={CHAT_COPY.invitePeople}
          icon={UserPlus}
          tone="aqua"
          onPress={() => router.push({ pathname: "/invitations", params: { plan: planId } })}
        />
      ) : null}
    </View>
  );
}

const Row = React.memo(function Row({ onLayout, ...props }: RowProps & { onLayout: (key: string) => void }) {
  return (
    <View onLayout={() => onLayout(props.row.key)}>
      <RowBody {...props} />
    </View>
  );
});

type RowProps = {
  row: FeedRow;
  planId: string;
  largeText: boolean;
  onLink: (href: string) => void;
  onActions: (key: string) => void;
  onAction: (row: FeedRow, name: string) => void;
  onRetry: (clientId: string) => void;
};

const actionsOf = (actions: MessageAction[], links: FeedLink[] = []) => [
  ...actions.map((name) => ({ name, label: ACTION_LABEL[name] })),
  // VoiceOver reads a bubble as one element, so each link is an action too (H31, H32 Q13).
  ...links.map((l) => ({ name: l.name, label: l.label })),
];

/** One row of the feed: a day, Resbite's line, a change chip, the ended line, a bubble, an announcement, or an unsent one. */
function RowBody({ row, planId, largeText, onLink, onActions, onAction, onRetry }: RowProps) {
  switch (row.type) {
    case "day":
      // Each message's label carries its day, so the separator is for the eye only (K-S14).
      return (
        <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.dayWrap}>
          <Text style={styles.day}>{row.text}</Text>
        </View>
      );
    case "system":
    case "ended":
      return (
        <Text accessibilityLabel={row.label} style={styles.system}>
          {row.text}
        </Text>
      );
    case "change":
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.label}
          onPress={() => router.push({ pathname: "/event", params: { plan: planId } })}
          style={({ pressed }) => [styles.change, pressed && styles.pressed]}
        >
          <Text style={styles.changeText}>
            {row.text}
            {row.tail ? <Text style={styles.changeTail}>{` · ${row.tail}`}</Text> : null}
          </Text>
        </Pressable>
      );
    case "pending": {
      const actions = actionsOf(row.actions);
      // A failed one is a button that sends again; one the close overtook can only be deleted (H32 29, Q49).
      const retries = row.failed && !row.closed;
      return (
        <View style={[styles.message, styles.mine]}>
          <Pressable
            accessible
            accessibilityRole={retries ? "button" : undefined}
            role={retries ? undefined : "article"}
            accessibilityLabel={row.label}
            accessibilityActions={actions.length ? actions : undefined}
            onAccessibilityAction={(e: AccessibilityActionEvent) => onAction(row, e.nativeEvent.actionName)}
            onPress={retries ? () => onRetry(row.clientId) : undefined}
            onLongPress={actions.length ? () => onActions(row.key) : undefined}
            delayLongPress={LONG_PRESS_MS}
            style={({ pressed }) => [styles.bubble, styles.bubbleMine, (row.failed || row.closed) && styles.bubbleFailed, pressed && styles.pressed]}
          >
            <Text style={[styles.body, ownDirection]}>{row.body}</Text>
          </Pressable>
          <Text aria-hidden style={[styles.state, (row.failed || row.closed) && styles.stateFailed]}>
            {row.closed ? CHAT_COPY.closedBeforeSent : row.failed ? CHAT_COPY.notSent : CHAT_COPY.sending}
          </Text>
        </View>
      );
    }
    case "bubble":
    case "announcement": {
      const actions = actionsOf(row.actions, row.links);
      const longPress = row.actions.length ? () => onActions(row.key) : undefined;
      const body = (
        <Text style={[styles.body, row.gone && styles.gone, ownDirection]}>
          {row.gone
            ? row.text
            : linkParts(row.text).map((p, i) =>
                p.href ? (
                  <LinkText key={i} text={p.text} href={p.href} onLink={onLink} onLongPress={longPress} />
                ) : (
                  <React.Fragment key={i}>{p.text}</React.Fragment>
                ),
              )}
        </Text>
      );
      // One element for the screen reader, named by its label (H32 Q49).
      const press = {
        accessible: true,
        role: "article" as const,
        accessibilityLabel: row.label,
        accessibilityActions: actions.length ? actions : undefined,
        onAccessibilityAction: (e: AccessibilityActionEvent) => onAction(row, e.nativeEvent.actionName),
        onLongPress: longPress,
        delayLongPress: LONG_PRESS_MS,
      };
      if (row.type === "announcement")
        return (
          <Pressable {...press} style={({ pressed }) => [styles.announcement, pressed && styles.pressed]}>
            <Text style={styles.announcementKey}>{row.heading}</Text>
            {body}
          </Pressable>
        );
      return (
        <View style={[styles.message, row.own && styles.mine, largeText && styles.messageWide]}>
          {row.showAuthor && row.author ? (
            <Text aria-hidden style={styles.who}>
              {row.author}
            </Text>
          ) : null}
          <Pressable {...press} style={({ pressed }) => [styles.bubble, row.own && styles.bubbleMine, pressed && styles.pressed]}>
            {body}
          </Pressable>
        </View>
      );
    }
  }
}

/**
 * A link in a message: a tap asks before the browser; a hold opens its message's actions, so Remove reaches link spam
 * (H31 Q4). Text has no delayLongPress (Pressability's is fixed at 500 ms), so the hold is timed here to match the
 * bubble's 400 ms (H35). The web's Text takes no press-in: there the bubble's own Pressable times the hold.
 */
function LinkText({ text, href, onLink, onLongPress }: { text: string; href: string; onLink: (href: string) => void; onLongPress?: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <Text
      accessibilityRole="link"
      style={styles.link}
      onPressIn={
        onLongPress
          ? () => {
              held.current = false;
              stop();
              timer.current = setTimeout(() => {
                timer.current = null;
                held.current = true;
                onLongPress();
              }, LONG_PRESS_MS);
            }
          : undefined
      }
      onPressOut={stop}
      onPress={() => {
        // The hold opened the actions; its release isn't a tap.
        if (held.current) held.current = false;
        else onLink(href);
      }}
    >
      {text}
    </Text>
  );
}

/** The line in words, Announce for hosts, the growing field and Send (CH-02, CH-02a; K-S14, K-S15). */
function Composer({
  summary,
  draft,
  cut,
  keyboard,
  onDraft,
  onSend,
  onAnnounce,
}: {
  summary: ChatSummary;
  draft: string;
  /** The last paste was longer than a message may be. */
  cut: boolean;
  keyboard: boolean;
  onDraft: (text: string) => void;
  onSend: () => void;
  onAnnounce: () => void;
}) {
  const insets = useSafeAreaInsets();
  const largeText = useLargeText();
  const [height, setHeight] = useState(FIELD_MIN);
  const max = largeText ? FIELD_MAX_LARGE : FIELD_MAX;
  useEffect(() => {
    if (draft === "") setHeight(FIELD_MIN);
  }, [draft]);
  return (
    <View style={[styles.composer, { paddingBottom: keyboard ? space.s : Math.max(insets.bottom, space.s) }]}>
      <View style={[styles.toRow, largeText && styles.toRowStacked]}>
        <Text style={[styles.to, largeText && styles.toLarge]}>{CHAT_COPY.toGoing}</Text>
        {canAnnounce(summary) ? <AnnouncePill onPress={onAnnounce} /> : null}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          multiline
          value={draft}
          // The limit counts characters as the server does (code points), so no maxLength (H32 Q26).
          onChangeText={onDraft}
          placeholder={CHAT_COPY.field}
          accessibilityLabel={CHAT_COPY.field}
          placeholderTextColor="#99929F"
          // The web's field is a textarea that doesn't grow by itself; the phone's grows with its text up to `max`.
          {...(Platform.OS === "web"
            ? { rows: 1, onContentSizeChange: (e: { nativeEvent: { contentSize: { height: number } } }) => setHeight(e.nativeEvent.contentSize.height + 2) }
            : null)}
          style={[
            s.field,
            styles.input,
            { maxHeight: max },
            Platform.OS === "web" ? { height: Math.min(max, Math.max(FIELD_MIN, height)) } : null,
          ]}
        />
        <IconButton icon={ArrowUp} label={CHAT_COPY.send} tone="pink" disabled={!hasVisibleText(draft)} onPress={onSend} />
      </View>
      {cut ? (
        <Text accessibilityLiveRegion="polite" style={styles.tooLong}>
          {CHAT_COPY.tooLong}
        </Text>
      ) : null}
    </View>
  );
}

/** Announce: a small outlined pill with no icon, its target 44 pt with its slop (H31). */
function AnnouncePill({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={CHAT_COPY.announce}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.announcePill, pressed && styles.pressed]}
    >
      <Text style={styles.announcePillText}>{CHAT_COPY.announce}</Text>
    </Pressable>
  );
}

/**
 * In place of the field once the chat closed (CH-06), with Do this again for the hosts (H12). Words the field, or the
 * announcement sheet, still held at the close stay readable and selectable under it (K-S10, H32 Q46, H35).
 */
function ClosedCard({ summary, now, drafts, onAgain }: { summary: ChatSummary; now: number; drafts: string[]; onAgain: () => void }) {
  const insets = useSafeAreaInsets();
  const card = closedCard(summary, now);
  return (
    <View style={[styles.closed, { paddingBottom: Math.max(insets.bottom, space.l) }]}>
      <View accessibilityLiveRegion="polite" style={styles.closedText}>
        <Copy style={styles.closedLine}>{card.line}</Copy>
        {card.why ? <Copy style={styles.closedWhy}>{card.why}</Copy> : null}
      </View>
      {drafts.filter(hasVisibleText).map((words, i) => (
        <View key={i} style={styles.draft}>
          <Text style={styles.draftLabel}>{CHAT_COPY.notSentDraft}</Text>
          <Text selectable style={[styles.draftText, ownDirection]}>
            {words}
          </Text>
        </View>
      ))}
      {summary.host ? (
        <View style={styles.centre}>
          <Button icon={false} secondary title={EVENT_COPY.doThisAgain} onPress={onAgain} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * New announcement (CH-03): who gets it with live counts, the text and Send. It starts on `defaultAudience` (K-N7);
 * Cancel keeps the audience and the text for the next opening (H32 34); a send that goes through resets both.
 */
function AnnounceSheet({
  visible,
  chat,
  summary,
  body,
  onBody,
  error,
  onCancel,
  onSent,
}: {
  visible: boolean;
  chat: Chat;
  summary: ChatSummary;
  /** The words, kept by the screen so they outlive the sheet (H35). */
  body: string;
  onBody: (text: string) => void;
  /** The chat's error to show here while the sheet is open: its own refusal, or a send's (H35). */
  error: string | null;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [audience, setAudience] = useState<ChatAudience>(defaultAudience(summary));
  const [cut, setCut] = useState(false);
  const [sending, setSending] = useState(false);
  const mounted = useMounted();
  const largeText = useLargeText();
  const send = async () => {
    setSending(true);
    const done = await chat.announce(body, audience);
    if (!mounted.current) return;
    setSending(false);
    if (done) {
      onBody("");
      setCut(false);
      setAudience(defaultAudience(summary));
      onSent();
    }
  };
  const options: Array<{ key: ChatAudience; title: string }> = [
    { key: "going", title: CHAT_COPY.audienceGoing(summary.going) },
    { key: "everyone", title: CHAT_COPY.audienceEveryone(summary.everyone) },
  ];
  return (
    <GrabberSheet visible={visible} title={CHAT_COPY.newAnnouncement} onClose={onCancel}>
      <Text style={styles.sheetLabel}>{CHAT_COPY.whoGetsIt}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={CHAT_COPY.whoGetsIt}>
        {options.map((o) => {
          const on = audience === o.key;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityLabel={o.title}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => setAudience(o.key)}
              style={styles.radioRow}
            >
              <View style={styles.radio}>{on ? <View style={styles.radioDot} /> : null}</View>
              <Text style={styles.radioText}>{o.title}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        multiline
        value={body}
        onChangeText={(text) => {
          const fit = fitEdit(body, text);
          if (fit.cut) sayTooLong();
          onBody(fit.text);
          setCut(fit.cut);
        }}
        placeholder={CHAT_COPY.announcePlaceholder}
        accessibilityLabel={CHAT_COPY.announcePlaceholder}
        placeholderTextColor="#99929F"
        {...(Platform.OS === "web" ? { rows: largeText ? 5 : 3 } : null)}
        style={[s.field, styles.announceField]}
      />
      {cut ? (
        <Text accessibilityLiveRegion="polite" style={styles.tooLong}>
          {CHAT_COPY.tooLong}
        </Text>
      ) : null}
      <ErrorNote message={error} />
      <Button
        icon={false}
        title={CHAT_COPY.sendAnnouncement}
        loading={sending}
        disabled={sending || !hasVisibleText(body)}
        onPress={() => void send()}
      />
      <View style={styles.centre}>
        <TextAction title={CHAT_COPY.cancel} onPress={onCancel} />
      </View>
    </GrabberSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { opacity: 0.75 },
  notice: { padding: 20, gap: space.m },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: space.s,
    backgroundColor: c.paper,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  barText: { flex: 1, minWidth: 0 },
  barTitle: { fontFamily: fonts.display, fontSize: 17, color: c.ink },
  barTitleLine: { lineHeight: 22 },
  barLine: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  barLineHeight: { lineHeight: 16 },
  barSpacer: { width: 44 },
  pinned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    backgroundColor: c.purpleSoft,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  pinnedKey: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, color: "#665381" },
  pinnedText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: c.ink },
  closing: {
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    backgroundColor: c.cream,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    fontFamily: fonts.body,
    fontSize: 13,
    color: c.ink,
    textAlign: "center",
  },
  errorBand: { paddingHorizontal: 14, paddingTop: space.s },
  feed: { paddingHorizontal: 14, paddingVertical: space.m, gap: space.s },
  earlier: { paddingVertical: space.m, alignItems: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  emptyUnder: { paddingVertical: space.l, alignItems: "center" },
  emptyBlock: { alignItems: "center", gap: space.m },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: c.ink, textAlign: "center" },
  emptyHint: { color: c.muted, fontSize: 14, textAlign: "center" },
  dayWrap: { alignItems: "center", marginTop: 2 },
  day: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: c.muted },
  system: { alignSelf: "center", maxWidth: "90%", fontFamily: fonts.body, fontSize: 12, color: c.muted, textAlign: "center" },
  change: {
    alignSelf: "center",
    maxWidth: "94%",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.m,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: c.line,
    backgroundColor: c.paper,
  },
  changeText: { fontFamily: fonts.medium, fontSize: 12, color: c.ink, textAlign: "center" },
  changeTail: { fontFamily: fonts.body, color: c.muted },
  announcement: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: c.purpleSoft,
    borderRadius: 16,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    gap: 2,
  },
  announcementKey: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, color: "#665381" },
  message: { maxWidth: "80%", alignSelf: "flex-start", gap: 2 },
  messageWide: { maxWidth: "92%" },
  mine: { alignSelf: "flex-end", alignItems: "flex-end" },
  who: { fontFamily: fonts.medium, fontSize: 11, color: c.muted, marginLeft: 10 },
  bubble: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 6,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    boxShadow: depth.small,
  },
  bubbleMine: { backgroundColor: c.pinkSoft, borderColor: "#F8CBD0", borderBottomLeftRadius: 18, borderBottomRightRadius: 6 },
  bubbleFailed: { borderColor: c.error },
  body: { fontFamily: fonts.body, fontSize: 14, color: c.ink },
  gone: { fontStyle: "italic", color: c.muted },
  link: { color: c.aquaDark, textDecorationLine: "underline" },
  state: { fontFamily: fonts.body, fontSize: 11, color: c.muted, marginRight: 6, textAlign: "right" },
  stateFailed: { color: c.error },
  composer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.paper, paddingHorizontal: 14, paddingTop: space.s, gap: 6 },
  toRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s },
  toRowStacked: { flexDirection: "column", alignItems: "flex-start" },
  to: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: c.muted },
  toLarge: { flex: 0 },
  announcePill: {
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: c.line,
    backgroundColor: c.paper,
  },
  announcePillText: { fontFamily: fonts.medium, fontSize: 12, color: c.ink },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: space.s },
  input: { flex: 1, minHeight: FIELD_MIN, borderRadius: 22, backgroundColor: "#FAF9F7", paddingVertical: 10, textAlignVertical: "top" },
  tooLong: { fontFamily: fonts.body, fontSize: 12, color: c.error },
  closed: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream, paddingHorizontal: 20, paddingTop: space.l, gap: space.m },
  closedText: { gap: space.xs },
  closedLine: { fontFamily: fonts.medium, fontSize: 15 },
  closedWhy: { color: c.muted, fontSize: 14 },
  draft: { gap: 2 },
  draftLabel: { fontFamily: fonts.medium, fontSize: 12, color: c.error },
  draftText: { fontFamily: fonts.body, fontSize: 14, color: c.ink },
  question: { gap: space.m },
  questionText: { fontFamily: fonts.medium, fontSize: 17 },
  linkQuestion: { fontFamily: fonts.display, fontSize: 22, color: c.ink },
  sheetLabel: { fontFamily: fonts.medium, fontSize: 13, color: c.ink },
  radioRow: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 48 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.ink, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: c.ink },
  radioText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 15, color: c.ink },
  announceField: { minHeight: 84, borderRadius: 18, textAlignVertical: "top" },
  centre: { alignItems: "center" },
});
