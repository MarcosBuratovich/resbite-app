import React from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type PressableProps,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, MapPin, Plus, X, type LucideIcon } from "lucide-react-native";
import { Button, Copy, s, useLargeText, useReduceMotion } from "./ui";
import { EventPictureView } from "./categories";
import { categoryPalette, colors as c, depth, fonts, r, space } from "./tokens";
import { motionPolicy } from "../domain/rules";
import type { CategoryKey } from "../domain/categories";
import type { EventPicture } from "../domain/events";
import { dateBadgeParts, timeText, type CoverCardPart } from "../domain/eventView";
import { spokenDateTime } from "../domain/schedule";
import { progressLabel } from "../domain/steps";

// UX1 component kit (spec "Component kit"). States use aria-* props: react-native-web
// 0.21 ignores accessibilityState, while React Native maps aria-* on iOS.

/**
 * A Pressable that scales on press, like Button, and does not scale under Reduce Motion
 * (spec principle 8). `outerStyle` carries layout; `style` is the pressable's own look.
 * Exported for the creation steps' own chips, tiles and cards (PlanSteps).
 */
export function ScalePressable({
  outerStyle,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps & { outerStyle?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const policy = motionPolicy(reduce);
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[outerStyle, anim]}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          scale.value = withTiming(policy.pressScale, { duration: 90 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = reduce
            ? withTiming(1, { duration: 0 })
            : withSpring(1, { damping: 18, stiffness: 260, mass: 0.7 });
          onPressOut?.(e);
        }}
      />
    </Animated.View>
  );
}

export type ChipTone = "neutral" | "aqua" | "pink" | "status";
const tones: Record<ChipTone, { tint: string; ink: string }> = {
  neutral: { tint: c.surface, ink: c.ink },
  aqua: { tint: c.aquaSoft, ink: c.aquaDark },
  pink: { tint: c.pinkSoft, ink: "#963F58" },
  status: { tint: c.purpleSoft, ink: "#665381" },
};

/** The tone for a role or status chip text. */
export function chipToneFor(text: string): ChipTone {
  if (text === "Cancelled") return "pink";
  if (text === "Hosting") return "aqua";
  if (text === "Invited") return "status";
  return "neutral";
}

/** An icon and short text in a tinted tone. A pressable chip is a button whose label may say more than its text. */
export function Chip({
  text,
  icon: Icon,
  tone = "neutral",
  category,
  label,
  hint,
  onPress,
  selected = false,
  disabled = false,
}: {
  text: string;
  icon?: LucideIcon;
  tone?: ChipTone;
  category?: CategoryKey;
  label?: string;
  hint?: string;
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { tint, ink } = category ? categoryPalette[category] : tones[tone];
  const fg = selected ? c.paper : ink;
  const body = (
    <>
      {Icon && <Icon size={15} strokeWidth={1.8} color={fg} />}
      <Copy style={[styles.chipText, { color: fg }]}>{text}</Copy>
    </>
  );
  if (!onPress)
    return (
      <View accessible={label !== undefined} accessibilityLabel={label} style={[styles.chip, { backgroundColor: tint }]}>
        {body}
      </View>
    );
  return (
    <ScalePressable
      outerStyle={styles.chipOuter}
      accessibilityRole="button"
      accessibilityLabel={label ?? text}
      accessibilityHint={hint}
      aria-selected={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        styles.chipPressable,
        { backgroundColor: selected ? ink : tint, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      {body}
    </ScalePressable>
  );
}

/** A rounded selectable tile (day, category or action), at least 44 pt. */
export function Tile({
  title,
  subtitle,
  icon: Icon,
  label,
  hint,
  selected = false,
  disabled = false,
  role = "button",
  category,
  size = "small",
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  label?: string;
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  role?: "button" | "checkbox";
  category?: CategoryKey;
  size?: "small" | "large";
  onPress: () => void;
}) {
  const { tint, ink } = category ? categoryPalette[category] : { tint: c.aquaSoft, ink: c.aquaDark };
  const large = size === "large";
  const state = role === "checkbox" ? { "aria-checked": selected } : { "aria-selected": selected };
  return (
    <ScalePressable
      accessibilityRole={role}
      accessibilityLabel={label ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={hint}
      {...state}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        large && styles.tileLarge,
        {
          backgroundColor: selected ? tint : large ? c.pink : c.paper,
          borderColor: selected ? ink : large ? "#F8CBD0" : c.line,
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
        },
      ]}
    >
      {Icon && (
        <Icon size={large ? 28 : 20} strokeWidth={1.7} color={selected ? ink : large ? "#963F58" : c.aquaDark} />
      )}
      <Copy
        style={
          large
            ? [styles.tileTitle, styles.tileTitleLarge, { color: selected ? ink : c.ink }]
            : [styles.tileTitle, { color: selected ? ink : c.ink }]
        }
      >
        {title}
      </Copy>
      {subtitle ? <Copy style={styles.tileSubtitle}>{subtitle}</Copy> : null}
    </ScalePressable>
  );
}

/** A 44 pt circular icon button. The label is required: it carries the full meaning. */
export function IconButton({
  icon: Icon,
  label,
  hint,
  onPress,
  disabled = false,
  busy = false,
  tone = "soft",
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "soft" | "plain" | "pink";
}) {
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      aria-disabled={disabled || busy}
      aria-busy={busy}
      disabled={disabled || busy}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: tone === "plain" ? "transparent" : tone === "pink" ? c.pinkSoft : c.surface,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={c.aquaDark} /> : <Icon size={21} strokeWidth={1.8} color={c.ink} />}
    </ScalePressable>
  );
}

/**
 * The floating + labelled "New resbite". Under Larger Text it renders inline as a pill instead.
 * Screens place one of each: `placement="inline"` in the content, `placement="float"` in an
 * absolutely positioned layer above the tab bar.
 */
export function Fab({ onPress, placement }: { onPress: () => void; placement: "float" | "inline" }) {
  const largeText = useLargeText();
  if (largeText !== (placement === "inline")) return null;
  if (placement === "inline") return <Button title="New resbite" onPress={onPress} />;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel="New resbite"
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}
    >
      <Plus size={28} strokeWidth={2} color={c.ink} />
    </ScalePressable>
  );
}

/** "SAT / 12". Hidden from assistive tech: the card's label already says the date. */
export function DateBadge({ startsAt }: { startsAt: string | null }) {
  const parts = dateBadgeParts(startsAt);
  return (
    <View aria-hidden style={styles.badge}>
      <Text style={styles.badgeWeekday}>{parts?.weekday ?? "—"}</Text>
      <Text style={styles.badgeDay}>{parts?.day ?? ""}</Text>
    </View>
  );
}

export type CardChip = { key: string; text: string; tone?: ChipTone; category?: CategoryKey; icon?: LucideIcon };

function CoverArt({ picture, uri }: { picture: EventPicture; uri?: string | null }) {
  if (uri)
    return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />;
  const basic = picture.kind === "cover" ? picture.fallback : picture;
  const tint = basic.kind === "placeholder" ? categoryPalette[basic.category].tint : c.cream;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, alignItems: "center", justifyContent: "center" }]}>
      <EventPictureView picture={picture} fill />
    </View>
  );
}

/**
 * A picture above a solid info panel; never text over the photo (spec principle 5).
 * - `onPress`: the whole card is one button with the composed `label`; nothing inside is focusable.
 * - `onPressPart` + `partLabels`: Review. Each part is its own button that jumps to its step.
 * - Otherwise the title is the screen's heading, unless `heading={false}`.
 * - `pictureLabel`: the organizer's photo description; on a static card the picture is an image with this label.
 */
export function CoverCard({
  picture,
  uri,
  title,
  startsAt,
  place,
  chips = [],
  label,
  onPress,
  onPressPart,
  partLabels,
  dimmed = false,
  hero = false,
  heading = true,
  pictureLabel,
}: {
  picture: EventPicture;
  uri?: string | null;
  title: string;
  startsAt: string | null;
  place: string;
  chips?: readonly CardChip[];
  label?: string;
  onPress?: () => void;
  onPressPart?: (part: CoverCardPart) => void;
  partLabels?: Record<CoverCardPart, string>;
  dimmed?: boolean;
  hero?: boolean;
  heading?: boolean;
  pictureLabel?: string;
}) {
  const largeText = useLargeText();
  const [focused, setFocused] = React.useState(false);
  const parts = Boolean(onPressPart && partLabels);
  const part = (key: CoverCardPart, children: React.ReactNode, style?: StyleProp<ViewStyle>, spoken?: string) =>
    parts ? (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={partLabels![key]}
        onPress={() => onPressPart!(key)}
        style={({ pressed }) => [styles.part, style, pressed && { backgroundColor: c.surface }]}
      >
        {children}
      </Pressable>
    ) : (
      <View key={key} accessible={spoken !== undefined} accessibilityLabel={spoken} aria-label={spoken} style={style}>
        {children}
      </View>
    );
  const time = timeText(startsAt);
  const content = (
    <>
      {part(
        "picture",
        <View
          style={[styles.picture, { height: hero ? 220 : 168 }, dimmed && { opacity: 0.5 }]}
          // A static card reads the photo description; pressable cards and Review say it in their labels.
          {...(!onPress && !parts && pictureLabel?.trim()
            ? {
                accessible: true,
                accessibilityRole: "image" as const,
                accessibilityLabel: pictureLabel.trim(),
                "aria-label": pictureLabel.trim(),
              }
            : {})}
        >
          <CoverArt picture={picture} uri={uri} />
        </View>,
      )}
      <View style={styles.panel}>
        {part(
          "title",
          <Text
            accessibilityRole={!onPress && !parts && heading ? "header" : undefined}
            style={[styles.cardTitle, hero && styles.cardTitleHero, largeText && { lineHeight: undefined }]}
          >
            {title}
          </Text>,
        )}
        {part(
          "date",
          <>
            <DateBadge startsAt={startsAt} />
            <Copy style={styles.cardLine}>{time || "Date to choose"}</Copy>
          </>,
          [styles.dateRow, largeText && styles.stacked],
          // The badge is hidden from assistive tech. Pressable and Review modes say the date in
          // their labels; the static (heading) card says it here.
          !onPress && startsAt && !Number.isNaN(new Date(startsAt).getTime())
            ? spokenDateTime(new Date(startsAt), new Date())
            : undefined,
        )}
        {part(
          "place",
          <>
            <MapPin size={16} color={c.muted} />
            <Copy style={styles.cardLine}>{place.trim() || "Place to choose"}</Copy>
          </>,
          styles.placeRow,
        )}
        {(chips.length > 0 || parts) &&
          part(
            "chips",
            <View style={styles.chipRow}>
              {chips.length > 0 ? (
                chips.map((chip) => (
                  <Chip key={chip.key} text={chip.text} tone={chip.tone} category={chip.category} icon={chip.icon} />
                ))
              ) : (
                <Chip text="Pick a vibe" />
              )}
            </View>,
          )}
      </View>
    </>
  );
  if (onPress)
    return (
      <ScalePressable
        outerStyle={styles.card}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onFocus={(e) => {
          // Keyboard focus only (focus-visible); the ring sits inside the card so overflow cannot clip it.
          const node = e.target as unknown as { matches?: (selector: string) => boolean };
          setFocused(Platform.OS === "web" ? Boolean(node.matches?.(":focus-visible")) : false);
        }}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [pressed && { opacity: 0.9 }]}
      >
        {content}
        {focused && <View testID="card-focus" style={styles.cardFocus} />}
      </ScalePressable>
    );
  return <View style={styles.card}>{content}</View>;
}

/** Up to three initial avatars plus a count; reads as its label, for example "3 going". */
export function AvatarStack({ names, label, onPress }: { names: readonly string[]; label: string; onPress?: () => void }) {
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  const body = (
    <>
      <View style={styles.avatars}>
        {shown.map((name, i) => (
          <View key={`${name}-${i}`} style={[styles.avatar, i > 0 && { marginLeft: -10 }]}>
            <Text style={styles.avatarText}>{(name.trim()[0] ?? "?").toLocaleUpperCase()}</Text>
          </View>
        ))}
        {extra > 0 && <Copy style={styles.avatarExtra}>{`+${extra}`}</Copy>}
      </View>
      <Copy style={{ fontSize: 14 }}>{label}</Copy>
    </>
  );
  if (!onPress)
    return (
      <View accessible accessibilityLabel={label} style={styles.avatarRow}>
        {body}
      </View>
    );
  return (
    <ScalePressable
      outerStyle={{ alignSelf: "flex-start" }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Shows the guest list"
      onPress={onPress}
      style={({ pressed }) => [styles.avatarRow, { opacity: pressed ? 0.85 : 1 }]}
    >
      {body}
    </ScalePressable>
  );
}

/** Two or three options as a radio group (Upcoming/Past, Going/Can’t make it). */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { key: K; text: string; label?: string }[];
  value: K | null;
  onChange: (key: K) => void;
  disabled?: boolean;
}) {
  const largeText = useLargeText();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, largeText && styles.stacked]}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={option.label ?? option.text}
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => {
              if (!selected) onChange(option.key);
            }}
            style={[styles.segment, largeText && { flex: 0, alignSelf: "stretch" }, selected && styles.segmentOn, disabled && { opacity: 0.55 }]}
          >
            <Copy style={selected ? [styles.segmentText, styles.segmentTextOn] : styles.segmentText}>{option.text}</Copy>
          </Pressable>
        );
      })}
    </View>
  );
}

/** StepScreen's 48 pt round Previous step and Close buttons (steps v2). The label is required. */
function StepButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.stepButton, pressed && { backgroundColor: c.surface }]}
    >
      <Icon size={24} strokeWidth={2.2} color={c.ink} />
    </ScalePressable>
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={progressLabel(step, total)}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={progressLabel(step, total)}
      style={styles.progress}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.bar, i < step && styles.barOn]} />
      ))}
    </View>
  );
}

/**
 * One question per screen: full-width progress (read as "Step 2 of 4"), a row with the
 * round Previous step and Close buttons and the header (the Preview chip) between them, a
 * big question title (a header), the content and the pinned primary pill, which moves
 * inline under Larger Text. Without Previous step, Close takes its place on the left (steps
 * v2 mockup). "Previous step" changes the step; "Close" leaves through the caller's guard.
 * Content slides in, or fades under Reduce Motion (StepBody).
 */
export function StepScreen({
  step,
  total = 4,
  title,
  hint,
  titleRef,
  onBack,
  onClose,
  header,
  status,
  primary,
  scrollRef,
  direction = "forward",
  children,
}: {
  step: number | null;
  total?: number;
  title: string;
  hint?: string;
  titleRef?: React.RefObject<Text | null>;
  onBack?: () => void;
  onClose: () => void;
  header?: React.ReactNode;
  status?: string;
  primary?: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  direction?: "forward" | "back";
  children: React.ReactNode;
}) {
  const largeText = useLargeText();
  const reduce = useReduceMotion();
  const footer = (
    <View testID="step-primary" style={[styles.stepFooter, largeText && styles.inlineFooter]}>
      {primary}
      {status ? (
        <Copy accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Copy>
      ) : null}
    </View>
  );
  return (
    <SafeAreaView testID="step-screen" style={s.page}>
      {step !== null && <Progress step={step} total={total} />}
      <View style={styles.stepTop}>
        {onBack ? (
          <StepButton icon={ChevronLeft} label="Previous step" onPress={onBack} />
        ) : (
          <StepButton icon={X} label="Close" onPress={onClose} />
        )}
        <View style={styles.stepMiddle}>{header}</View>
        {onBack ? <StepButton icon={X} label="Close" onPress={onClose} /> : <View style={styles.spacer} />}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          testID="step-scroll"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.stepScroll}
        >
          <StepBody key={title} reduce={reduce} direction={direction}>
            <Text
              ref={titleRef}
              accessibilityRole="header"
              accessibilityHint={hint}
              style={[s.title, styles.stepTitle, largeText && { lineHeight: undefined }]}
            >
              {title}
            </Text>
            {children}
          </StepBody>
          {largeText && footer}
        </ScrollView>
        {!largeText && footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** How long after a step change its title can take VoiceOver focus: StepBody's slide or fade has finished. */
export const STEP_SETTLED_MS = 250;

/**
 * A step's content, remounted for each step (`key={title}`): it slides in from the right going
 * forward (from the left going back), fully opaque, or only fades under Reduce Motion (spec:
 * "Steps slide (and fade under Reduce Motion)"). It settles within STEP_SETTLED_MS.
 *
 * Shared values only, never Reanimated layout animations (`entering`, `exiting` or `layout`):
 * on the new architecture a layout animation leaves the native view at its first-layout frame,
 * so content that grows afterwards (the When pickers) falls outside it and can't be tapped on
 * iPhone, though the JS layout is right. Confirmed on the owner's iPhone, 9 October 2026.
 */
function StepBody({
  reduce,
  direction,
  children,
}: {
  reduce: boolean;
  direction: "forward" | "back";
  children: React.ReactNode;
}) {
  const progress = useSharedValue(0);
  // The fade opts out of Reanimated's system Reduce Motion skip (spec: steps fade under Reduce
  // Motion); the slide stays off then.
  React.useEffect(() => {
    progress.value = withTiming(1, { duration: reduce ? 120 : 220, reduceMotion: ReduceMotion.Never });
  }, [progress, reduce]);
  const shift = direction === "back" ? -60 : 60;
  // Both branches set opacity and translateX, so a Reduce Motion change never leaves a stale value.
  const motion = useAnimatedStyle(() =>
    reduce
      ? { opacity: progress.value, transform: [{ translateX: 0 }] }
      : { opacity: 1, transform: [{ translateX: (1 - progress.value) * shift }] },
  );
  return <Animated.View style={[styles.stepBody, motion]}>{children}</Animated.View>;
}

/** A bottom sheet for ⓘ explanations and short pickers. */
export function InfoSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReduceMotion();
  return (
    <Modal visible={visible} transparent animationType={reduce ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessible={false} focusable={false} style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal aria-modal>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={[s.title, styles.sheetTitle]}>
                {title}
              </Text>
              <IconButton icon={X} label="Close sheet" onPress={onClose} />
            </View>
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Moves VoiceOver (or browser focus) to a step's title after the step changes. */
export function focusHeading(target: Text | null) {
  if (!target) return;
  if (Platform.OS === "web") {
    const node = target as unknown as HTMLElement;
    node.setAttribute("tabindex", "-1");
    // A layout animation used to keep the new title `visibility: hidden` (so unfocusable) for a
    // frame or two; StepBody's shared-value animation leaves it focusable, and the retry stays as a
    // guard. Retry each frame until focus lands, for at most about half a second, and stop if
    // the person has focused something else.
    const before = document.activeElement;
    let frames = 0;
    const attempt = () => {
      if (!node.isConnected || (document.activeElement !== before && document.activeElement !== node)) return;
      node.focus();
      if (document.activeElement !== node && ++frames < 30) requestAnimationFrame(attempt);
    };
    attempt();
  } else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}

/** Announces a short message on iOS and Android. On the web, ErrorNote's alert role announces it. */
export function announce(message: string) {
  if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(message);
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: r.chip,
  },
  chipOuter: { alignSelf: "flex-start" },
  chipPressable: { minHeight: 44, paddingHorizontal: 14 },
  chipText: { fontSize: 13, flexShrink: 1 },
  tile: {
    minHeight: 64,
    padding: space.m,
    gap: 6,
    borderRadius: r.tile,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLarge: { minHeight: 96, padding: space.xl, boxShadow: depth.button },
  tileTitle: { fontFamily: fonts.medium, fontSize: 14, textAlign: "center" },
  tileTitleLarge: { fontFamily: fonts.display, fontSize: 22 },
  tileSubtitle: { fontSize: 12, color: c.muted, textAlign: "center" },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.pink,
    borderWidth: 1,
    borderColor: "#F8CBD0",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.button,
  },
  badge: {
    minWidth: 52,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: c.surface,
    alignItems: "center",
  },
  badgeWeekday: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, color: "#963F58" },
  badgeDay: { fontFamily: fonts.display, fontSize: 22, color: c.ink },
  card: {
    borderRadius: r.card,
    overflow: "hidden",
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: "#EFEAF0",
    boxShadow: depth.card,
  },
  cardFocus: { ...StyleSheet.absoluteFill, pointerEvents: "none", borderRadius: r.card, borderWidth: 3, borderColor: c.aquaDark },
  picture: { width: "100%", overflow: "hidden" },
  panel: { padding: space.l, gap: space.s },
  part: { minHeight: 44, borderRadius: 12, justifyContent: "center" },
  cardTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: c.ink },
  cardTitleHero: { fontSize: 28, lineHeight: 34 },
  // Start-aligned even inside a Review part button, so Review matches the card guests see.
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: space.m },
  placeRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: space.s },
  stacked: { flexDirection: "column", alignItems: "flex-start" },
  cardLine: { flexShrink: 1, fontSize: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  avatarRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.m, minHeight: 44 },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.aquaSoft,
    borderWidth: 2,
    borderColor: c.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 13, color: c.aquaDark },
  avatarExtra: { marginLeft: 6, fontSize: 13, color: c.muted },
  segmented: { flexDirection: "row", gap: 4, padding: 4, borderRadius: r.tile, backgroundColor: c.surface },
  segment: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: r.tile, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: c.paper, boxShadow: depth.small },
  segmentText: { fontSize: 14, color: c.muted, textAlign: "center" },
  segmentTextOn: { fontFamily: fonts.medium, color: c.ink },
  // Steps v2 (owner-approved mockup): full-width bars, 48 pt round buttons, a 36 pt title.
  progress: { flexDirection: "row", gap: 6, marginHorizontal: 20, paddingTop: space.m },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.line },
  barOn: { backgroundColor: c.aquaDark },
  stepTop: { flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  // The header (Preview chip) is centred; a row keeps its own alignSelf from pulling it left.
  stepMiddle: { flex: 1, flexDirection: "row", justifyContent: "center" },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.paper,
    boxShadow: depth.small,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: { width: 48 },
  stepScroll: { paddingHorizontal: 20, paddingTop: space.s, paddingBottom: 28 },
  stepBody: { gap: space.l },
  stepTitle: { fontSize: 36, lineHeight: 42, marginTop: 6, marginBottom: 2 },
  stepFooter: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10, gap: 6 },
  inlineFooter: { paddingHorizontal: 0, paddingTop: 20 },
  status: { fontSize: 11, color: c.muted, textAlign: "center" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(34, 30, 45, 0.25)" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: r.card, borderTopRightRadius: r.card, backgroundColor: c.paper },
  sheetBody: { padding: space.xl, gap: space.l },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: space.m },
  sheetTitle: { flex: 1, fontSize: 24, lineHeight: 30 },
});
