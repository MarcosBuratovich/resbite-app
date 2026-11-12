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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowUp, Ban, Bell, BellOff, ChevronRight, Ellipsis, Flag, LogOut, ShieldAlert, Trash2, UserPlus, UserRound, Users } from "lucide-react-native";
import { Button, Copy, ErrorNote, TextAction, s, useLargeText, useReduceMotion } from "../src/design/ui";
import { Chip, IconButton, focusHeading } from "../src/design/kit";
import { GrabberSheet } from "../src/design/GrabberSheet";
import { MenuRow } from "../src/design/MenuRow";
import { BlockQuestion, BlockedLine, ReportSheet } from "../src/design/ReportSheet";
import { ChatRulesSheet } from "../src/design/ChatRulesSheet";
import { NotificationAsk } from "../src/design/NotificationAsk";
import { colors as c, depth, fonts, space } from "../src/design/tokens";
import { CHAT_COPY, type ChatAudience } from "../src/domain/chatCopy";
import { SAFETY_COPY, rulesHeldLine, showsReportOrBlock, shownName } from "../src/domain/safetyCopy";
import {
  audienceOptions,
  canAnnounce,
  canLeave,
  closedCard,
  closingLine,
  dayFor,
  defaultAudience,
  emptyState,
  fitEdit,
  groupDay,
  hasVisibleText,
  headerLine,
  isSeriesId,
  linkHost,
  linkParts,
  messageLabel,
  nextOpens,
  peopleLine,
  phoneZone,
} from "../src/domain/chatRules";
import { EVENT_COPY, chatPeople, chatPersonFor, type ChatPerson } from "../src/domain/eventPage";
import { NOTIFICATION_ASK } from "../src/domain/notifications";
import type { ChatSummary } from "../src/services/chat";
import { safetyErrorMessage, safetyGateway } from "../src/services/safety";
import { UNNAMED_GUEST } from "../src/services/rsvp";
import { useEvent } from "../src/state/useEvent";
import { useApp } from "../src/state/AppState";
import { useChat, type Chat } from "../src/state/useChat";
import { shownMessages, withEndedLine, withPending } from "../src/state/chatModel";
import { chatFeed, nothingSaid, type FeedLink, type FeedRow, type MessageAction } from "../src/state/chatFeed";
import { dismissed, holdError, heldUntil, type HeldError } from "../src/state/heldError";
import { useNotificationAsk } from "../src/state/useNotificationAsk";
import { focusedChat, setFocusedChat } from "../src/services/deviceReminders";
import { finishLeave, leaveGroup, stillCurrent, useGroupScreen } from "../src/state/useGroupLeave";

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
  report: SAFETY_COPY.reportMessage,
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

/**
 * The long-press sheet: its rows, Delete's or Remove's question, or plan 3's report. `reportId` is the message reported,
 * kept so the report stays open with what was typed if the message is taken down meanwhile (ruling SR6 Q1).
 */
type ActionSheet = { key: string; view: "menu" | "delete" | "remove" | "report"; direct: boolean; reportId?: number };

/**
 * Plan 3's Report or block, in the menu's sheet (Decision 3, G-N6): the chat's people, or one person's sheet (Report,
 * then Block or Unblock), their report, the block confirm, or its result line. An author's name opens their sheet there.
 */
type Safety = { kind: "people" } | { kind: "person"; userId: string; step: "actions" | "report" | "block" | "blocked" };

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
  // No series, no session to read with (the preview, a sign-out), or the server's refusal: nothing to wait for (H41 m5).
  const out = !valid || !chat.ready || (!summary && chat.error === CHAT_COPY.notInChat);
  // The first open of a chat the person is in, while it is open, is the moment for "Get notified?" (CH-P17, K-N15);
  // the hook shows it once per phone, only while iPhone's permission was never asked for.
  const ask = useNotificationAsk(summary?.open && !out ? { chat: true } : null);
  // While this chat is the screen in focus its pushes don't show over it (K-S9). Leaving clears it only while it is
  // still this chat's: a chat opened on top takes focus before this one hears its blur.
  const focusedSeries = valid ? series : null;
  useFocusEffect(
    useCallback(() => {
      if (!focusedSeries) return;
      setFocusedChat(focusedSeries);
      return () => {
        if (focusedChat() === focusedSeries) setFocusedChat(null);
      };
    }, [focusedSeries]),
  );
  // A leave of this group that goes through while this chat is in focus lands on My resbites (UI Q4).
  useGroupScreen(focusedSeries);
  // Refused after a leave whose answer was lost: the leave went through, so it finishes on the phone (ruling GR6 M5).
  const { session: viewer, preview: previewing, captureSession } = useApp();
  // The chat's people come from the current occurrence's own reads (G-N6): its guests, the connection states and the
  // blocks, read again after any block or unblock (NOTE 2). The people list's read: no Chat row of its own to read.
  const event = useEvent(summary && !out ? summary.planId || undefined : undefined, { chain: true });
  const viewerId = viewer?.user.id ?? null;
  const people = useMemo(
    () =>
      chatPeople({
        guests: event.guests,
        owner: event.owner,
        admins: event.admins,
        userId: viewerId,
        blocks: event.blocks,
        // On a group every member is in its chat, answered or not (plan 2).
        isGroup: summary?.isGroup === true,
        unnamed: UNNAMED_GUEST,
      }),
    [event.guests, event.owner, event.admins, event.blocks, viewerId, summary?.isGroup],
  );
  const refused = valid && !summary && chat.error === CHAT_COPY.notInChat;
  useEffect(() => {
    if (refused && focusedSeries)
      finishLeave(focusedSeries, { userId: viewer?.user.id ?? null, preview: previewing }, stillCurrent(captureSession()));
    // Only the moment the chat refuses.
  }, [refused]);
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
          series={series}
          chat={chat}
          summary={summary}
          now={now}
          keyboard={keyboard}
          menuOpen={menuOpen}
          onMenu={setMenuOpen}
          people={people}
          blocks={event.blocks}
        />
      )}
      <NotificationAsk ask={ask} body={NOTIFICATION_ASK.chatBody} />
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
  series,
  chat,
  summary,
  now,
  keyboard,
  menuOpen,
  onMenu,
  people,
  blocks,
}: {
  /** The route's series, a valid one (the screen checked it): Leave group names it. */
  series: string;
  chat: Chat;
  summary: ChatSummary;
  now: number;
  keyboard: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  /** The chat's people but the reader (plan 3, G-N6), for Report or block and an author's sheet. */
  people: ChatPerson[];
  /** The people the reader blocked; null while unknown (N13). */
  blocks: ReadonlySet<string> | null;
}) {
  const { session, preview, captureSession } = useApp();
  const viewerId = session?.user.id ?? "";
  const largeText = useLargeText();
  const reduce = useReduceMotion();
  const mounted = useMounted();
  const zone = useMemo(phoneZone, []);
  const open = summary.open;
  // A group's weekday, "Thursday", for its announcements' audience (plan 2).
  const day = groupDay(summary);

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
  // The ••• menu shows its rows, or Leave group's question in their place (G-N13), as Delete and Remove ask in place.
  const [menuView, setMenuView] = useState<"menu" | "leave">("menu");
  const [leaving, setLeaving] = useState(false);
  // What a second tap reads before a redraw (review M3), as Send's does (H32 Q27).
  const leavingRef = useRef(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  // Whether the menu is open now, for a leave's answer that lands later.
  const menuShown = useRef(menuOpen);
  menuShown.current = menuOpen;
  const leaveQuestion = useRef<Text | null>(null);
  const leaveRow = useRef<View | null>(null);
  const leftQuestion = useRef(false);
  // Plan 3: Report or block in the menu's sheet, and an Unblock running from it.
  const [safety, setSafety] = useState<Safety | null>(null);
  // Each of Report or block's views takes focus (H32 Q53, ruling SR6): the list's heading, the person's name, and Block
  // again after Keep.
  const peopleHeading = useRef<Text | null>(null);
  const personHeading = useRef<Text | null>(null);
  const blockRow = useRef<View | null>(null);
  const backToBlock = useRef(false);
  const [unblocking, setUnblocking] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  // The chat rules (G-B4(d), I6): asked before a first message, or after a refusal (`chat.rulesNeeded`).
  const [rulesAsk, setRulesAsk] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  // The list: rows (a deleted system line never shows, Decision 6), the ended line and the unsent messages, worded,
  // oldest first; reversed for the inverted list.
  const rows = useMemo(
    () =>
      chatFeed(withEndedLine(withPending(shownMessages(chat.messages), chat.pending), summary, chat.hasEarlier, now), {
        names: chat.names,
        viewerId,
        now,
        zone,
        title: summary.title,
        host: summary.host,
        closed: !open,
        group: summary.isGroup,
        day,
        planId: summary.planId,
      }),
    [chat.messages, chat.pending, chat.names, chat.hasEarlier, summary, now, viewerId, zone, open, day],
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
  const pinnedLabel = pinned
    ? messageLabel(pinned, chat.names, viewerId, now, zone, undefined, summary.isGroup, dayFor(pinned, summary.planId, day))
    : null;
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
      if (name === "report" && (row.type === "bubble" || row.type === "announcement"))
        return setSheet({ key: row.key, view: "report", direct: true, reportId: row.message.id });
      if (name === "deleteUnsent" && row.type === "pending") return void chat.discard(row.clientId);
      if (row.type === "bubble" || row.type === "announcement") {
        const href = row.links.find((l) => l.name === name)?.href;
        if (href) askLink(href);
      }
    },
    [askLink, chat.discard, openActions],
  );

  // A tap on an author's name opens their sheet in the menu's sheet (G-N6), over the chat, which stays on screen.
  const openPerson = useCallback(
    (userId: string) => {
      setSafetyError(null);
      setSafety({ kind: "person", userId, step: "actions" });
      onMenu(true);
    },
    [onMenu],
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
        onReread={chat.replace}
        onPerson={openPerson}
      />
    ),
    [summary.planId, largeText, askLink, openActions, onAction, chat.retry, chat.replace, onRowLayout, openPerson],
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
    // Not agreed to the chat rules yet: the rules first, and nothing is called (G-B4(d)).
    if (!summary.rulesAccepted) {
      setRulesError(null);
      setRulesAsk(true);
      return;
    }
    sendNow();
  };
  /** Sends what the field holds: the bubble shows at once, in `pending`, at the newest end. */
  const sendNow = () => {
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
  // The row changed under the sheet (taken down elsewhere, or sent): nothing left to offer. A report stays open with what
  // was typed, and says it can't go any more (ruling SR6 Q1): nothing closes without a word.
  useEffect(() => {
    if (sheet && sheet.view !== "report" && targetActions.length === 0) setSheet(null);
  }, [sheet, targetActions.length]);
  const reportGone = sheet?.view === "report" && !targetActions.includes("report");
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
  const safetyView = !safety ? null : safety.kind === "people" ? "people" : `${safety.userId}:${safety.step}`;
  useEffect(() => {
    if (!menuOpen || !safety) return;
    const back = backToBlock.current;
    backToBlock.current = false;
    const target =
      safety.kind === "people" ? peopleHeading.current : safety.step === "actions" ? (back ? blockRow.current : personHeading.current) : null;
    if (!target) return;
    const frame = requestAnimationFrame(() => focusHeading(target));
    return () => cancelAnimationFrame(frame);
    // When the view changes, not on every redraw of the same one.
  }, [menuOpen, safetyView]);
  // The menu opens on its rows, never on a question or a refusal left from before (Report or block's included).
  useEffect(() => {
    if (menuOpen) return;
    setMenuView("menu");
    setLeaveError(null);
    setSafety(null);
    setSafetyError(null);
  }, [menuOpen]);
  // The question takes focus; after Keep, the Leave group row does (H32 Q53).
  useEffect(() => {
    if (!menuOpen) return;
    const back = leftQuestion.current;
    leftQuestion.current = false;
    if (menuView === "menu" && !back) return;
    const frame = requestAnimationFrame(() => focusHeading(menuView === "leave" ? leaveQuestion.current : leaveRow.current));
    return () => cancelAnimationFrame(frame);
  }, [menuOpen, menuView]);
  /**
   * Leave group (G-N13) through `leaveGroup`: once it goes through, the phone's reminders follow and My resbites opens
   * while this chat is in focus. Leaving this screen runs its focus cleanup, so the push router stops skipping this
   * series (H36). A failure keeps the question open with its reason, and Leave group can be tapped again (G-N7); one
   * that lands after the menu closed is not kept for the next time it opens (review M3).
   */
  const leave = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    setLeaveError(null);
    // What it does once it went through belongs to this session only (ruling GR6 M1).
    const result = await leaveGroup(series, { userId: viewerId || null, preview }, stillCurrent(captureSession()));
    leavingRef.current = false;
    if (!mounted.current) return;
    setLeaving(false);
    if (result?.left) onMenu(false);
    else if (result && menuShown.current) setLeaveError(result.error);
  };

  // Plan 3: the person a sheet is about, as the chat's people now have them (an Unblock or a block read again shows at
  // once); an author no longer on the occurrence gets Report and Block only (G-N6).
  const person = safety?.kind === "person" ? chatPersonFor(people, safety.userId, chat.names, blocks, viewerId) : null;
  const unblock = async (who: ChatPerson) => {
    if (unblocking) return;
    setUnblocking(true);
    setSafetyError(null);
    try {
      // Through the gateway, so this chat and every other replace their lists (B3).
      await safetyGateway.unblock(who.userId);
      if (mounted.current) onMenu(false);
    } catch (e) {
      if (mounted.current) setSafetyError(safetyErrorMessage(e));
    } finally {
      if (mounted.current) setUnblocking(false);
    }
  };
  // The rules sheet over the chat: before a first message, or for messages the server held for them. An announcement
  // held for them is asked in the Announce sheet, which it came from (I6).
  const waiting = chat.rulesNeeded;
  const heldMessages = waiting !== null && waiting.announce === null && waiting.clientIds.length > 0 ? waiting.clientIds.length : 0;
  const rulesShown = rulesAsk || heldMessages > 0;
  const agree = async () => {
    const asked = rulesAsk;
    if (!(await chat.agreeRules())) {
      if (mounted.current) setRulesError(SAFETY_COPY.rulesNotSaved);
      return;
    }
    if (!mounted.current) return;
    setRulesError(null);
    setRulesAsk(false);
    // Before a first message: the words in the field go now, with a client id the session makes.
    if (asked) sendNow();
  };
  const cancelRules = () => {
    setRulesAsk(false);
    setRulesError(null);
    if (heldMessages > 0) chat.dismissRules();
  };
  // An announcement held for the rules brings its sheet back, if it was closed meanwhile (I6).
  const heldAnnouncement = waiting?.announce ?? null;
  useEffect(() => {
    if (heldAnnouncement) setAnnouncing(true);
  }, [heldAnnouncement]);

  const said = !nothingSaid(rows);
  const emptyBlock = said ? null : <EmptyState words={emptyState(summary)} open={open} planId={summary.planId} />;
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
        {shownError && showing && !menuOpen && !sheet && !announcing && !rulesShown ? (
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
        {safety?.kind === "people" ? (
          <View>
            <Text ref={peopleHeading} accessibilityRole="header" style={styles.sheetHeading}>
              {SAFETY_COPY.reportOrBlock}
            </Text>
            {people.map((p) => (
              <MenuRow
                key={p.userId}
                title={shownName(p.name)}
                hint={p.blocked ? SAFETY_COPY.blocked : undefined}
                // The label already says Blocked: said once (ruling SR6 draft).
                spokenHint={false}
                label={p.blocked ? `${shownName(p.name)}, ${SAFETY_COPY.blocked}` : shownName(p.name)}
                icon={UserRound}
                onPress={() => {
                  setSafetyError(null);
                  setSafety({ kind: "person", userId: p.userId, step: "actions" });
                }}
              />
            ))}
          </View>
        ) : safety?.kind === "person" && person ? (
          <View style={styles.question}>
            {safety.step !== "report" ? (
              <Text ref={personHeading} accessibilityRole={safety.step === "actions" ? "header" : undefined} style={styles.sheetHeading}>
                {shownName(person.name)}
              </Text>
            ) : null}
            {safety.step === "report" ? (
              <ReportSheet
                target={{ kind: "user", userId: person.userId, series: summary.seriesId, name: person.name }}
                onDone={() => onMenu(false)}
              />
            ) : safety.step === "block" ? (
              <BlockQuestion
                userId={person.userId}
                name={person.name}
                youHost={summary.host}
                theyHost={person.theyHost}
                onBlocked={() => setSafety({ ...safety, step: "blocked" })}
                onKeep={() => {
                  backToBlock.current = true;
                  setSafety({ ...safety, step: "actions" });
                }}
              />
            ) : safety.step === "blocked" ? (
              <BlockedLine />
            ) : (
              <View>
                {person.actions.map((action) =>
                  action === "report" ? (
                    <MenuRow
                      key={action}
                      title={SAFETY_COPY.reportPerson(shownName(person.name))}
                      icon={Flag}
                      disabled={unblocking}
                      onPress={() => setSafety({ ...safety, step: "report" })}
                    />
                  ) : action === "block" ? (
                    <MenuRow
                      key={action}
                      ref={blockRow}
                      title={SAFETY_COPY.block(shownName(person.name))}
                      icon={Ban}
                      destructive
                      disabled={unblocking}
                      onPress={() => setSafety({ ...safety, step: "block" })}
                    />
                  ) : (
                    <MenuRow
                      key={action}
                      title={SAFETY_COPY.unblock(shownName(person.name))}
                      icon={Ban}
                      busy={unblocking}
                      onPress={() => void unblock(person)}
                    />
                  ),
                )}
                <ErrorNote message={safetyError} />
              </View>
            )}
          </View>
        ) : menuView === "leave" ? (
          <View style={styles.question}>
            <Copy ref={leaveQuestion} accessibilityRole="header" style={styles.questionText}>
              {CHAT_COPY.leaveQuestion(summary.title, groupDay(summary))}
            </Copy>
            <Button icon={false} destructive title={CHAT_COPY.leaveGroup} loading={leaving} disabled={leaving} onPress={() => void leave()} />
            <Button
              icon={false}
              secondary
              title={CHAT_COPY.keep}
              disabled={leaving}
              onPress={() => {
                setLeaveError(null);
                leftQuestion.current = true;
                setMenuView("menu");
              }}
            />
            <ErrorNote message={leaveError} />
          </View>
        ) : (
          <>
            <View>
              <MenuRow
                title={peopleLine(summary)}
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
              {/* Plan 3 (Decision 3, NOTE 3-a): after Mute, before Leave group; hidden with nobody else here (G-N7). */}
              {showsReportOrBlock(people.length) ? (
                <MenuRow
                  title={SAFETY_COPY.reportOrBlock}
                  icon={ShieldAlert}
                  disabled={working}
                  onPress={() => {
                    dismissError();
                    setSafety({ kind: "people" });
                  }}
                />
              ) : null}
              {/* A group's member who isn't a host, while its chat is open (G-N13), in red after Mute. */}
              {canLeave(summary) ? (
                <MenuRow
                  ref={leaveRow}
                  title={CHAT_COPY.leaveGroup}
                  icon={LogOut}
                  destructive
                  disabled={working}
                  onPress={() => {
                    dismissError();
                    setLeaveError(null);
                    setMenuView("leave");
                  }}
                />
              ) : null}
            </View>
            <ErrorNote message={menuOpen ? shownError : null} />
          </>
        )}
      </GrabberSheet>

      <GrabberSheet
        visible={sheet !== null && (target !== undefined || sheet.view === "report")}
        label={target && "label" in target ? target.label : SAFETY_COPY.reportMessage}
        onClose={closeSheet}
      >
        {sheet && sheet.view === "report" && sheet.reportId !== undefined ? (
          // Someone else's message or announcement, sent (G-N12): its report, in place. Taken down meanwhile, it stays
          // with what was typed and says so (ruling SR6 Q1).
          <ReportSheet target={{ kind: "message", id: sheet.reportId }} unavailable={reportGone} onDone={() => setSheet(null)} />
        ) : sheet && target ? (
          sheet.view === "menu" ? (
            <View>
              {targetActions.map((action, i) => (
                <MenuRow
                  key={action}
                  ref={i === 0 ? firstMenuRow : undefined}
                  title={ACTION_LABEL[action]}
                  // Report isn't a take-down: no bin, not red (G-N12).
                  icon={action === "report" ? Flag : Trash2}
                  destructive={action !== "report"}
                  disabled={working}
                  onPress={() => {
                    if (action === "deleteUnsent" && target.type === "pending") {
                      setSheet(null);
                      void chat.discard(target.clientId);
                    } else if (action === "report" && (target.type === "bubble" || target.type === "announcement"))
                      setSheet({ ...sheet, view: "report", reportId: target.message.id });
                    else if (action === "delete" || action === "remove") setSheet({ ...sheet, view: action });
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

      {/* The chat rules over the chat (G-B4(d), I6): before a first message, or for messages held for them. */}
      <GrabberSheet visible={rulesShown} label={SAFETY_COPY.rulesTitle} onClose={cancelRules}>
        {rulesShown ? (
          <ChatRulesSheet
            held={rulesHeldLine(heldMessages, false)}
            error={rulesError}
            onAgree={agree}
            onCancel={cancelRules}
          />
        ) : null}
      </GrabberSheet>

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

/**
 * Nothing said yet (CH-07): a host's words while nobody is going, or while a group's owner is alone in it, with the
 * invitation to invite (`emptyState`); anyone else's "No messages yet".
 */
function EmptyState({ words, open, planId }: { words: { title: string; hint: string } | null; open: boolean; planId: string }) {
  if (!words) return <Copy style={styles.emptyHint}>{CHAT_COPY.noMessages}</Copy>;
  return (
    <View style={styles.emptyBlock}>
      <Text accessibilityRole="header" style={styles.emptyTitle}>
        {words.title}
      </Text>
      <Copy style={styles.emptyHint}>{words.hint}</Copy>
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
  /** Reads the chat again: a "Next one" line with no current occurrence to open (Decision 14). */
  onReread: () => void;
  /** A tap on an author's name: their sheet (plan 3, G-N6). */
  onPerson: (userId: string) => void;
};

const actionsOf = (actions: MessageAction[], links: FeedLink[] = []) => [
  ...actions.map((name) => ({ name, label: ACTION_LABEL[name] })),
  // VoiceOver reads a bubble as one element, so each link is an action too (H31, H32 Q13).
  ...links.map((l) => ({ name: l.name, label: l.label })),
];

/**
 * One row of the feed: a day, Resbite's line, a change chip, a group's "Next one", the ended line, a bubble, an
 * announcement, or an unsent one.
 */
function RowBody({ row, planId, largeText, onLink, onActions, onAction, onRetry, onReread, onPerson }: RowProps) {
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
    case "next":
      // A group's "Next one", old or new, drawn as the change chip and opening the same: the summary's current
      // occurrence, the newest the reader may read, never the line's own plan (Decision 14, I5). With none to open, the
      // chat is read again and stays on screen (G-N7).
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={row.label}
          accessibilityHint={nextOpens(planId) ? CHAT_COPY.opensResbite : CHAT_COPY.reloadsChat}
          onPress={() => (nextOpens(planId) ? router.push({ pathname: "/event", params: { plan: planId } }) : onReread())}
          style={({ pressed }) => [styles.change, pressed && styles.pressed]}
        >
          <Text style={styles.changeText}>{row.text}</Text>
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
            row.message.authorId ? (
              // The name opens the person's sheet: Report, and Block or Unblock (plan 3, G-N6). The bubble's label says
              // the name too, so the screen reader meets it once as text and once as this button.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={row.author}
                onPress={() => onPerson(row.message.authorId!)}
                hitSlop={{ top: 10, bottom: 4, left: 10, right: 10 }}
                style={({ pressed }) => [styles.whoButton, pressed && styles.pressed]}
              >
                <Text style={styles.who}>{row.author}</Text>
              </Pressable>
            ) : (
              <Text aria-hidden style={styles.who}>
                {row.author}
              </Text>
            )
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
        <Text style={[styles.to, largeText && styles.toLarge]}>{summary.isGroup ? CHAT_COPY.toGroup : CHAT_COPY.toGoing}</Text>
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
  // The chat rules, in this sheet's place (G-B4(d), I6): before a first announcement, or after the server held one for
  // them, keeping its words and audience; Cancel brings the announcement back.
  const [rulesFirst, setRulesFirst] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const heldAnnounce = chat.rulesNeeded?.announce ?? null;
  const showRules = rulesFirst || heldAnnounce !== null;
  // An announcement the session sent after I agree took its words with it: the next opening starts empty (I6).
  const announced = useRef(chat.announced);
  useEffect(() => {
    if (chat.announced === announced.current) return;
    announced.current = chat.announced;
    onBody("");
    setCut(false);
    setAudience(defaultAudience(summary));
    // Only when one went through.
  }, [chat.announced]);
  const sendNow = async () => {
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
  const send = async () => {
    // Not agreed to the chat rules yet: the rules first, and nothing is called.
    if (!summary.rulesAccepted) {
      setRulesError(null);
      setRulesFirst(true);
      return;
    }
    await sendNow();
  };
  const agree = async () => {
    const first = rulesFirst;
    if (!(await chat.agreeRules())) {
      if (mounted.current) setRulesError(SAFETY_COPY.rulesNotSaved);
      return;
    }
    if (!mounted.current) return;
    setRulesError(null);
    setRulesFirst(false);
    // Before a first announcement it goes now; one the server held, the session sends with its own client id.
    if (first) await sendNow();
    else onSent();
  };
  const cancelRules = () => {
    setRulesFirst(false);
    setRulesError(null);
    if (heldAnnounce) chat.dismissRules();
  };
  // A group's: everyone in the group first, then going this week; a one-off's: Going, then Everyone invited (G-S7).
  const options = audienceOptions(summary);
  const placeholder = summary.isGroup ? CHAT_COPY.announcePlaceholderGroup : CHAT_COPY.announcePlaceholder;
  if (showRules)
    return (
      <GrabberSheet
        visible={visible}
        label={SAFETY_COPY.rulesTitle}
        onClose={() => {
          cancelRules();
          onCancel();
        }}
      >
        <ChatRulesSheet
          held={heldAnnounce ? rulesHeldLine(chat.rulesNeeded?.clientIds.length ?? 0, true) : null}
          error={rulesError}
          onAgree={agree}
          onCancel={cancelRules}
        />
      </GrabberSheet>
    );
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
        placeholder={placeholder}
        accessibilityLabel={placeholder}
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
  whoButton: { alignSelf: "flex-start" },
  sheetHeading: { fontFamily: fonts.display, fontSize: 22, color: c.ink, marginBottom: space.s },
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
