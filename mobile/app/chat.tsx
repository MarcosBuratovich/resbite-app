import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { ArrowLeft, ArrowUp, Bell, BellOff, ChevronRight, Ellipsis, Megaphone, Trash2, UserPlus, Users } from "lucide-react-native";
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
  headerLine,
  isSeriesId,
  linkHost,
  linkParts,
  messageLabel,
} from "../src/domain/chatRules";
import { EVENT_COPY } from "../src/domain/eventPage";
import type { ChatSummary } from "../src/services/chat";
import { useApp } from "../src/state/AppState";
import { useChat, type Chat } from "../src/state/useChat";
import { withEndedLine, withPending } from "../src/state/chatModel";
import { chatFeed, type FeedRow, type MessageAction } from "../src/state/chatFeed";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The field grows with the text up to about five lines, then scrolls (rule 9). */
const FIELD_MIN = 44;
const FIELD_MAX = 124;
const FIELD_MAX_LARGE = 200;

const ACTION_LABEL: Record<MessageAction, string> = {
  delete: CHAT_COPY.deleteMine,
  remove: CHAT_COPY.removeTheirs,
  deleteUnsent: CHAT_COPY.deleteUnsent,
};

const phoneZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * A bubble's text keeps its own direction, so a message's bidi can't flip what's around it: `writingDirection: "auto"`
 * on iOS (the paragraph takes its first strong character), and on the web every root Text is already `dir="auto"`,
 * an isolate.
 */
const ownDirection: TextStyle | null = Platform.OS === "ios" ? { writingDirection: "auto" } : null;

/** The keyboard is up: the composer then pads 8 under the field instead of the home indicator's inset (K-S15). */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
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

type ActionSheet = { key: string; view: "menu" | "delete" | "remove"; direct: boolean };

/**
 * The chat (CH-02 to CH-08): /chat?series=<series id>. The header with the date and the going count, the pinned
 * announcement, the closing line, the feed (an inverted list, newest at the bottom) and the composer, or the closed card
 * once `summary.open` says so. A series that isn't one calls nothing (K-N14).
 */
export default function ChatScreen() {
  const { series } = useLocalSearchParams<{ series?: string }>();
  const valid = isSeriesId(series);
  const chat = useChat(valid ? series : undefined);
  if (!valid || (!chat.summary && chat.error === CHAT_COPY.notInChat)) return <NotInChat />;
  if (!chat.summary) return <Loading chat={chat} />;
  return <Conversation chat={chat} summary={chat.summary} />;
}

function NotInChat() {
  return (
    <View style={s.page}>
      <Bar title={CHAT_COPY.chat} />
      <View style={styles.notice}>
        <Copy>{CHAT_COPY.notInChat}</Copy>
      </View>
    </View>
  );
}

function Loading({ chat }: { chat: Chat }) {
  return (
    <View style={s.page}>
      <Bar title={CHAT_COPY.chat} />
      <View style={styles.notice}>
        <ErrorNote message={chat.error} />
        {chat.error ? (
          <Button icon={false} secondary title={EVENT_COPY.tryAgain} disabled={chat.busy} onPress={() => void chat.refresh()} />
        ) : (
          <ActivityIndicator accessibilityLabel={CHAT_COPY.chat} color={c.aquaDark} />
        )}
      </View>
    </View>
  );
}

/** The title bar, as the people list's: Back, the resbite's title with its second line, and ••• for the menu. */
function Bar({ title, line, onMore, planId }: { title: string; line?: string | null; onMore?: () => void; planId?: string }) {
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
          numberOfLines={largeText ? undefined : 1}
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

function Conversation({ chat, summary }: { chat: Chat; summary: ChatSummary }) {
  const viewerId = useApp().session?.user.id ?? "";
  const largeText = useLargeText();
  const reduce = useReduceMotion();
  const zone = useMemo(phoneZone, []);
  const tick = useMinuteTick(summary.closesAt, chat.serverNow);
  const now = useMemo(() => chat.serverNow(), [chat.serverNow, tick, chat.messages, chat.pending, summary]);

  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<ActionSheet | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [link, setLink] = useState<{ href: string; host: string } | null>(null);
  const [working, setWorking] = useState(false);

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
      }),
    [chat.messages, chat.pending, chat.names, chat.hasEarlier, summary, now, viewerId, zone],
  );
  const data = useMemo(() => [...rows].reverse(), [rows]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  // The pinned card loads back to its message, then scrolls there (K-S12).
  const list = useRef<FlatList<FeedRow>>(null);
  const latest = useRef(data);
  latest.current = data;
  const jumpTo = useRef<number | null>(null);
  // The row a jump waits on: an offset the list estimated for a row it hadn't laid out is corrected, once, when that
  // row lays out (K-S12).
  const waitingFor = useRef<string | null>(null);
  const tryJump = useCallback(() => {
    const id = jumpTo.current;
    if (id === null) return;
    const key = `m:${id}`;
    const index = latest.current.findIndex((r) => r.key === key);
    if (index < 0) return;
    jumpTo.current = null;
    waitingFor.current = key;
    setTimeout(() => {
      if (waitingFor.current === key) waitingFor.current = null;
    }, 2000);
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: !reduce });
  }, [reduce]);
  useEffect(tryJump, [data, tryJump]);
  const pinned = summary.pinned;
  const pinnedLabel = pinned ? messageLabel(pinned, chat.names, viewerId, now, zone) : null;
  const jumpToPinned = async () => {
    if (!pinned) return;
    jumpTo.current = pinned.id;
    await chat.loadUntil(pinned.id);
    tryJump();
  };
  // Not measured yet: go near it; its row's layout then tries once more.
  const onScrollToIndexFailed = useCallback(({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
    list.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index), animated: false });
  }, []);
  const onRowLayout = useCallback((key: string) => {
    if (waitingFor.current !== key) return;
    waitingFor.current = null;
    requestAnimationFrame(() => {
      const index = latest.current.findIndex((r) => r.key === key);
      if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
    });
  }, []);

  const closing = summary.open ? closingLine(summary.closesAt, now, summary.timeZone) : null;
  const header = headerLine(summary, now);
  const open = summary.open;
  // The closed card says why, so its own refusal isn't repeated above.
  const shownError = chat.error && !(chat.error === CHAT_COPY.closedShort && !open) ? chat.error : null;

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
      if (name.startsWith("link:") && (row.type === "bubble" || row.type === "announcement")) {
        const href = linkParts(row.text).filter((p) => p.href)[Number(name.slice(5))]?.href;
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

  // Stable, so typing in the field doesn't redraw the list.
  const keyOf = useCallback((r: FeedRow) => r.key, []);
  const hasEarlier = chat.hasEarlier;
  const loadEarlier = chat.loadEarlier;
  const onEndReached = useCallback(() => {
    if (hasEarlier) void loadEarlier();
  }, [hasEarlier, loadEarlier]);

  // Do this again: the plan screen on a copy of this resbite (H12), one at a time.
  const againOpen = useRef(false);
  const again = () => {
    if (againOpen.current) return;
    againOpen.current = true;
    router.push({ pathname: "/arrange", params: { again: summary.planId } });
    setTimeout(() => (againOpen.current = false), 1000);
  };
  const send = () => {
    if (!/\S/.test(draft)) return;
    const body = draft;
    setDraft("");
    void chat.send(body);
  };

  const target = sheet ? byKey.get(sheet.key) : undefined;
  const targetActions = target && "actions" in target ? target.actions : [];
  // The row changed under the sheet (taken down elsewhere, or sent): nothing left to offer.
  useEffect(() => {
    if (sheet && targetActions.length === 0) setSheet(null);
  }, [sheet, targetActions.length]);
  const takeDown = async (kind: "delete" | "remove") => {
    if (!target || (target.type !== "bubble" && target.type !== "announcement")) return;
    setWorking(true);
    const done = kind === "delete" ? await chat.deleteOwn(target.message.id) : await chat.remove(target.message.id);
    setWorking(false);
    if (done) setSheet(null);
  };

  const empty = rows.length === 0;
  const nobodyGoing = empty && summary.host && summary.accepted === 0;
  return (
    <View style={s.page}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Bar title={summary.title} line={header} planId={summary.planId} onMore={() => setMenuOpen(true)} />
        {pinned && pinnedLabel && pinned.body ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${CHAT_COPY.pinned}, ${pinnedLabel}`}
            onPress={() => void jumpToPinned()}
            style={({ pressed }) => [styles.pinned, pressed && styles.pressed]}
          >
            <Text style={styles.pinnedKey}>{CHAT_COPY.pinned}</Text>
            <Text numberOfLines={largeText ? 3 : 1} style={[styles.pinnedText, ownDirection]}>
              {pinned.body}
            </Text>
            <ChevronRight size={18} color={c.muted} />
          </Pressable>
        ) : null}
        {closing ? <Text style={styles.closing}>{closing}</Text> : null}
        {shownError ? (
          <View style={styles.errorBand}>
            <ErrorNote message={shownError} />
          </View>
        ) : null}
        {empty ? (
          <View style={styles.empty}>
            {nobodyGoing ? (
              <>
                <Text accessibilityRole="header" style={styles.emptyTitle}>
                  {CHAT_COPY.nobodyGoing}
                </Text>
                <Copy style={styles.emptyHint}>{CHAT_COPY.nobodyGoingHint}</Copy>
                {open ? (
                  <Chip
                    text={CHAT_COPY.invitePeople}
                    icon={UserPlus}
                    tone="aqua"
                    onPress={() => router.push({ pathname: "/invitations", params: { plan: summary.planId } })}
                  />
                ) : null}
              </>
            ) : (
              <Copy style={styles.emptyHint}>{CHAT_COPY.noMessages}</Copy>
            )}
          </View>
        ) : (
          <FlatList
            ref={list}
            data={data}
            inverted
            keyExtractor={keyOf}
            renderItem={renderItem}
            contentContainerStyle={styles.feed}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            // An incoming message doesn't move what someone is reading; at the bottom, it comes into view (K-S15).
            maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 120 }}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            onScrollToIndexFailed={onScrollToIndexFailed}
            ListFooterComponent={chat.hasEarlier ? <ActivityIndicator style={styles.earlier} color={c.aquaDark} /> : null}
          />
        )}
        {open ? (
          <Composer
            summary={summary}
            draft={draft}
            onDraft={setDraft}
            onSend={send}
            onAnnounce={() => setAnnouncing(true)}
          />
        ) : (
          <ClosedCard summary={summary} onAgain={again} />
        )}
      </KeyboardAvoidingView>

      <GrabberSheet visible={menuOpen} label={EVENT_COPY.moreButton} onClose={() => setMenuOpen(false)}>
        <View>
          <MenuRow
            title={CHAT_COPY.peopleInChat(summary.members)}
            icon={Users}
            onPress={() => {
              setMenuOpen(false);
              router.push({ pathname: "/guests", params: { plan: summary.planId } });
            }}
          />
          <MenuRow
            title={summary.mutedChat ? CHAT_COPY.unmute : CHAT_COPY.mute}
            hint={summary.mutedChat ? undefined : CHAT_COPY.muteHint}
            icon={summary.mutedChat ? Bell : BellOff}
            busy={working}
            onPress={async () => {
              setWorking(true);
              const done = await chat.setMute(!summary.mutedChat);
              setWorking(false);
              if (done) setMenuOpen(false);
            }}
          />
        </View>
        <ErrorNote message={menuOpen ? shownError : null} />
      </GrabberSheet>

      <GrabberSheet visible={sheet !== null && target !== undefined} label={target && "label" in target ? target.label : undefined} onClose={() => setSheet(null)}>
        {sheet && target ? (
          sheet.view === "menu" ? (
            <View>
              {targetActions.map((action) => (
                <MenuRow
                  key={action}
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
            </View>
          ) : (
            <View style={styles.question}>
              <Copy accessibilityRole="header" style={styles.questionText}>
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
                onPress={() => setSheet(sheet.direct ? null : { ...sheet, view: "menu" })}
              />
              <ErrorNote message={shownError} />
            </View>
          )
        ) : null}
      </GrabberSheet>

      <AnnounceSheet visible={announcing} chat={chat} summary={summary} onClose={() => setAnnouncing(false)} />

      <GrabberSheet visible={link !== null} title={link ? CHAT_COPY.openQuestion(link.host) : undefined} onClose={() => setLink(null)}>
        <View style={styles.question}>
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
    </View>
  );
}

/** One row of the feed: a day, Resbite's line, a change chip, the ended line, a bubble, an announcement, or an unsent one. */
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

function RowBody({
  row,
  planId,
  largeText,
  onLink,
  onActions,
  onAction,
  onRetry,
}: RowProps) {
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
          <Text style={styles.changeText}>{row.text}</Text>
        </Pressable>
      );
    case "pending": {
      const actions = row.actions.map((name) => ({ name, label: ACTION_LABEL[name] }));
      return (
        <View style={[styles.message, styles.mine]}>
          <Pressable
            accessibilityLabel={row.label}
            accessibilityActions={actions.length ? actions : undefined}
            onAccessibilityAction={(e: AccessibilityActionEvent) => onAction(row, e.nativeEvent.actionName)}
            onPress={row.failed ? () => onRetry(row.clientId) : undefined}
            onLongPress={actions.length ? () => onActions(row.key) : undefined}
            delayLongPress={400}
            style={({ pressed }) => [styles.bubble, styles.bubbleMine, row.failed && styles.bubbleFailed, pressed && styles.pressed]}
          >
            <Text style={[styles.body, ownDirection]}>{row.body}</Text>
          </Pressable>
          <Text aria-hidden style={[styles.state, row.failed && styles.stateFailed]}>
            {row.failed ? CHAT_COPY.notSent : CHAT_COPY.sending}
          </Text>
        </View>
      );
    }
    case "bubble":
    case "announcement": {
      const links = row.gone ? [] : linkParts(row.text).filter((p) => p.href);
      const actions = [
        ...row.actions.map((name) => ({ name, label: ACTION_LABEL[name] })),
        // VoiceOver reads the bubble as one element, so each link is an action too.
        ...links.map((p, i) => ({ name: `link:${i}`, label: `${CHAT_COPY.open} ${linkHost(p.href!)}` })),
      ];
      const body = (
        <Text style={[styles.body, row.gone && styles.gone, ownDirection]}>
          {row.gone
            ? row.text
            : linkParts(row.text).map((p, i) =>
                p.href ? (
                  <Text key={i} accessibilityRole="link" onPress={() => onLink(p.href!)} style={styles.link}>
                    {p.text}
                  </Text>
                ) : (
                  <React.Fragment key={i}>{p.text}</React.Fragment>
                ),
              )}
        </Text>
      );
      const press = {
        accessibilityLabel: row.label,
        accessibilityActions: actions.length ? actions : undefined,
        onAccessibilityAction: (e: AccessibilityActionEvent) => onAction(row, e.nativeEvent.actionName),
        onLongPress: row.actions.length ? () => onActions(row.key) : undefined,
        delayLongPress: 400,
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

/** The line in words, Announce for hosts, the growing field and Send (CH-02, CH-02a; K-S14, K-S15). */
function Composer({
  summary,
  draft,
  onDraft,
  onSend,
  onAnnounce,
}: {
  summary: ChatSummary;
  draft: string;
  onDraft: (text: string) => void;
  onSend: () => void;
  onAnnounce: () => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
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
        {canAnnounce(summary) ? <Chip text={CHAT_COPY.announce} icon={Megaphone} onPress={onAnnounce} /> : null}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          multiline
          maxLength={1000}
          value={draft}
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
        <IconButton icon={ArrowUp} label={CHAT_COPY.send} tone="pink" disabled={!/\S/.test(draft)} onPress={onSend} />
      </View>
    </View>
  );
}

/** In place of the field once the chat closed (CH-06), with Do this again for the hosts (H12). */
function ClosedCard({ summary, onAgain }: { summary: ChatSummary; onAgain: () => void }) {
  const insets = useSafeAreaInsets();
  const card = closedCard(summary);
  return (
    <View style={[styles.closed, { paddingBottom: Math.max(insets.bottom, space.l) }]}>
      <View accessibilityLiveRegion="polite" style={styles.closedText}>
        <Copy style={styles.closedLine}>{card.line}</Copy>
        {card.why ? <Copy style={styles.closedWhy}>{card.why}</Copy> : null}
      </View>
      {summary.host ? <Button icon={false} secondary title={EVENT_COPY.doThisAgain} onPress={onAgain} /> : null}
    </View>
  );
}

/** New announcement (CH-03): who gets it with live counts, starting on `defaultAudience` (K-N7), the text and Send. */
function AnnounceSheet({ visible, chat, summary, onClose }: { visible: boolean; chat: Chat; summary: ChatSummary; onClose: () => void }) {
  const [audience, setAudience] = useState<ChatAudience>(defaultAudience(summary));
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const largeText = useLargeText();
  useEffect(() => {
    if (!visible) return;
    setAudience(defaultAudience(summary));
    setFailed(false);
    // Each opening starts on the default audience.
  }, [visible]);
  const send = async () => {
    setSending(true);
    setFailed(false);
    const done = await chat.announce(body, audience);
    setSending(false);
    if (done) {
      setBody("");
      onClose();
    } else setFailed(true);
  };
  const options: Array<{ key: ChatAudience; title: string }> = [
    { key: "going", title: CHAT_COPY.audienceGoing(summary.going) },
    { key: "everyone", title: CHAT_COPY.audienceEveryone(summary.everyone) },
  ];
  return (
    <GrabberSheet visible={visible} title={CHAT_COPY.newAnnouncement} onClose={onClose}>
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
        maxLength={1000}
        value={body}
        onChangeText={setBody}
        placeholder={CHAT_COPY.announcePlaceholder}
        accessibilityLabel={CHAT_COPY.announcePlaceholder}
        placeholderTextColor="#99929F"
        {...(Platform.OS === "web" ? { rows: largeText ? 5 : 3 } : null)}
        style={[s.field, styles.announceField]}
      />
      <ErrorNote message={failed ? chat.error : null} />
      <Button icon={false} title={CHAT_COPY.sendAnnouncement} loading={sending} disabled={sending || !/\S/.test(body)} onPress={() => void send()} />
      <View style={styles.centre}>
        <TextAction title={CHAT_COPY.cancel} onPress={onClose} />
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
  earlier: { paddingVertical: space.m },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.m },
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
  announcement: { backgroundColor: c.purpleSoft, borderRadius: 16, paddingHorizontal: space.m, paddingVertical: space.s, gap: 2 },
  announcementKey: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, color: "#665381" },
  message: { maxWidth: "80%", alignSelf: "flex-start", gap: 2 },
  messageWide: { maxWidth: "92%" },
  mine: { alignSelf: "flex-end", alignItems: "flex-end" },
  who: { fontFamily: fonts.medium, fontSize: 11, color: c.muted, marginLeft: 10 },
  bubble: {
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
  state: { fontFamily: fonts.body, fontSize: 11, color: c.muted, marginRight: 6 },
  stateFailed: { color: c.error },
  composer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.paper, paddingHorizontal: 14, paddingTop: space.s, gap: 6 },
  toRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s },
  toRowStacked: { flexDirection: "column", alignItems: "flex-start" },
  to: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: c.muted },
  toLarge: { flex: 0 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: space.s },
  input: { flex: 1, minHeight: FIELD_MIN, borderRadius: 22, backgroundColor: "#FAF9F7", paddingVertical: 10, textAlignVertical: "top" },
  closed: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.cream, paddingHorizontal: 20, paddingTop: space.l, gap: space.m },
  closedText: { gap: space.xs },
  closedLine: { fontFamily: fonts.medium, fontSize: 15 },
  closedWhy: { color: c.muted, fontSize: 14 },
  question: { gap: space.m },
  questionText: { fontFamily: fonts.medium, fontSize: 17 },
  sheetLabel: { fontFamily: fonts.medium, fontSize: 13, color: c.ink },
  radioRow: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 48 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.ink, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: c.ink },
  radioText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 15, color: c.ink },
  announceField: { minHeight: 84, borderRadius: 18, textAlignVertical: "top" },
  centre: { alignItems: "center" },
});
