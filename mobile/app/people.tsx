import { GluestackCheckbox } from "../src/design/gluestack";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import {
  Check,
  Users,
  ContactRound,
  Settings2,
  UserPlus,
  Pencil,
  Trash2,
  Plus,
  Mail,
} from "lucide-react-native";
import {
  ActionRow,
  ActionGroup,
  TextAction,
  IconBadge,
  Back,
  Button,
  Copy,
  ErrorNote,
  Field,
  Title,
  s,
} from "../src/design/ui";
import { colors as c } from "../src/design/tokens";
import { PreviewNotice } from "../src/design/Chrome";
import { useApp } from "../src/state/AppState";
import { peopleStore } from "../src/services/people";
import {
  readContactPage,
  expandContactAccess,
  hasContactAccess,
} from "../src/services/contacts";
import {
  mergePeople,
  person,
  togglePerson,
  type Person,
  type PeopleGroup,
} from "../src/domain/people";
import { planGateway } from "../src/services/plans";
import { canEditPlan } from "../src/domain/plans";

export default function People() {
  const { plan: planId } = useLocalSearchParams<{ plan?: string }>();
  const { session, preview, localPlans } = useApp();
  const scope = preview ? "preview" : session?.user.id;
  const navigation = useNavigation();
  const [groups, setGroups] = useState<PeopleGroup[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contacts, setContacts] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [limited, setLimited] = useState(false);
  const [more, setMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [missing, setMissing] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);
  const mounted = useRef(true);
  const working = useRef(false);
  const contextKey = `${scope ?? "signed-out"}:${planId ?? "groups"}`;
  const identity = useRef(contextKey);
  identity.current = contextKey;
  const isCurrent = () => mounted.current && identity.current === contextKey;
  const contactAccessTouched = useRef(false);
  function clearContactCache() {
    setContacts([]);
    setMore(false);
    setLimited(false);
    setOffset(0);
    setMissing(0);
    setQuery("");
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setReady(false);
    setGroups([]);
    setSelected([]);
    setEditing(null);
    setGroupName("");
    setName("");
    setAddress("");
    setDirty(false);
    setNotice("");
    clearContactCache();
    contactAccessTouched.current = false;
    working.current = false;
    setBusy(false);
    void (async () => {
      if (!scope) throw Error("Sign in to manage your people.");
      const data = await peopleStore.list(scope);
      if (planId) {
        const plan = preview
          ? localPlans.find((p) => p.id === planId)
          : await planGateway.read(planId);
        if (!plan || !canEditPlan(plan, session?.user.id, preview))
          throw Error(
            "Only the organizer can choose people for an upcoming active plan.",
          );
      }
      if (active) {
        setGroups(data.groups);
        setSelected(planId ? (data.plans[planId] ?? []) : []);
        setReady(true);
      }
    })()
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load groups.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, planId, retry]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        contactAccessTouched.current &&
        !working.current
      )
        void hasContactAccess()
          .then((allowed) => {
            if (isCurrent()) {
              clearContactCache();
              setNotice(
                allowed
                  ? "Tap Choose phone contacts to refresh the contacts you allow. Saved selections are unchanged."
                  : "Contacts access changed. Saved selections remain local; you can remove them below.",
              );
            }
          })
          .catch(() => {
            if (isCurrent()) clearContactCache();
          });
    });
    return () => sub.remove();
  }, [contextKey]);
  usePreventRemove(dirty || busy, ({ data }) => {
    if (busy) return;
    const leave = () => navigation.dispatch(data.action);
    if (Platform.OS === "web") {
      if (window.confirm("Leave without saving your people changes?")) leave();
    } else
      Alert.alert(
        "Leave without saving?",
        "Your changes to this selection will be lost.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Leave", style: "destructive", onPress: leave },
        ],
      );
  });
  async function perform(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (isCurrent())
        setError(
          e instanceof Error
            ? e.message
            : "Could not save. Your selection is unchanged.",
        );
    } finally {
      if (isCurrent()) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  async function loadContacts(next = 0, expand = false) {
    await perform(async () => {
      contactAccessTouched.current = true;
      let page;
      try {
        if (expand) await expandContactAccess();
        page = await readContactPage(next, !expand && next === 0);
      } catch (e) {
        if (isCurrent()) clearContactCache();
        throw e;
      }
      if (!isCurrent()) return;
      if (next === 0 && page.people.length === 0)
        setNotice(
          "No usable contacts are available in this page. You can add someone yourself below.",
        );
      setContacts((old) =>
        next ? mergePeople(old, page.people) : page.people,
      );
      setOffset(page.nextOffset);
      setMore(page.more);
      setLimited(page.limited);
      setMissing((old) => (next ? old + page.missing : page.missing));
    });
  }
  function startGroup(group?: PeopleGroup) {
    setEditing(group?.id ?? Crypto.randomUUID());
    setGroupName(group?.name ?? "");
    setSelected(group?.members.map((p) => ({ ...p })) ?? []);
    clearContactCache();
    setName("");
    setAddress("");
    setError(null);
    setNotice("");
    setDirty(false);
  }
  function addManual() {
    const p = person(name, address);
    if (!p) {
      setError(
        "Add a name and a usable email or phone number, including its country code when available.",
      );
      return;
    }
    setSelected((old) => mergePeople(old, [p]));
    setName("");
    setAddress("");
    setError(null);
    setDirty(true);
  }
  function save() {
    if (!scope) return;
    if (editing && (!groupName.trim() || selected.length === 0)) {
      setError("Give this group a name and choose at least one person.");
      return;
    }
    void perform(async () => {
      if (editing) {
        const data = await peopleStore.saveGroup(scope, {
          id: editing,
          name: groupName,
          members: selected,
        });
        if (isCurrent()) {
          setGroups(data.groups);
          setEditing(null);
          setSelected([]);
          setNotice("Group saved on this device.");
        }
      } else if (planId) {
        await peopleStore.saveSelection(scope, planId, selected);
        if (isCurrent())
          setNotice(
            "People saved for this plan. No invitations have been sent.",
          );
      }
      if (isCurrent()) setDirty(false);
    });
  }
  function removeGroup(g: PeopleGroup) {
    const remove = () =>
      void perform(async () => {
        const data = await peopleStore.deleteGroup(scope!, g.id);
        if (isCurrent()) {
          setGroups(data.groups);
          setNotice("Group deleted. Existing plan selections are unchanged.");
        }
      });
    if (Platform.OS === "web") {
      if (
        window.confirm(
          `Delete ${g.name}? Existing plan selections will stay as they are.`,
        )
      )
        remove();
    } else
      Alert.alert(
        "Delete group?",
        `Delete ${g.name}? Existing plan selections will stay as they are.`,
        [
          { text: "Keep group", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: remove },
        ],
      );
  }
  const choosing = Boolean(planId || editing);
  const row = (p: Person, checked: boolean) => (
    <GluestackCheckbox
      key={p.key}
      value={p.key}
      isChecked={checked}
      aria-label={`${p.name}, ${p.address}`}
      accessibilityState={{ checked, disabled: busy }}
      accessibilityLabel={`${p.name}, ${p.address}`}
      isDisabled={busy}
      onChange={() => {
        setSelected((old) => togglePerson(old, p));
        setDirty(true);
      }}
      style={{
        padding: 12,
        borderWidth: 1,
        borderColor: checked ? c.aquaDark : c.line,
        borderRadius: 12,
        backgroundColor: checked ? c.aquaSoft : c.paper,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderWidth: 1,
          borderColor: c.aquaDark,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={18} color={c.aquaDark} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Copy>{p.name}</Copy>
        <Copy style={s.muted}>{p.address}</Copy>
      </View>
    </GluestackCheckbox>
  );
  return (
    <SafeAreaView style={s.page}>
      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: 32 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <PreviewNotice dismissible={false} />
        <Back label={planId ? "My resbites" : "Profile"} />
        <IconBadge icon={Users} tone="violet" />
        <Title>
          {planId
            ? "Your kind of company."
            : editing
              ? "Your group."
              : "People & groups."}
        </Title>
        <Copy style={s.muted}>
          Contact details stay on this device. Nothing is sent automatically.
        </Copy>
        {loading && <Copy>Loading your people…</Copy>}
        <ErrorNote message={error} />
        {!loading && !ready && (
          <Button title="Try again" onPress={() => setRetry((n) => n + 1)} />
        )}
        {Boolean(notice) && (
          <Copy accessibilityLiveRegion="polite" style={{ color: c.aquaDark }}>
            {notice}
          </Copy>
        )}
        {ready && (
          <>
            {!choosing && (
              <>
                <ActionGroup>
                  <ActionRow
                    icon={Plus}
                    title="Create a group"
                    description="Keep your favourite people together"
                    onPress={() => startGroup()}
                  />
                </ActionGroup>
                <Copy style={s.muted}>
                  Groups are private to this account and phone. Signing out
                  removes them from this device.
                </Copy>
              </>
            )}
            {!editing &&
              groups.map((g) => (
                <View key={g.id} style={[s.card, { padding: 20, gap: 12 }]}>
                  <Title style={{ fontSize: 23 }}>{g.name}</Title>
                  <Copy style={s.muted}>
                    {g.members.length}{" "}
                    {g.members.length === 1 ? "person" : "people"}
                  </Copy>
                  {planId ? (
                    <ActionRow
                      icon={UserPlus}
                      title={`Add ${g.name}`}
                      disabled={busy}
                      onPress={() => {
                        setSelected((old) => mergePeople(old, g.members));
                        setDirty(true);
                      }}
                    />
                  ) : (
                    <>
                      <ActionRow
                        icon={Pencil}
                        title={`Edit ${g.name}`}
                        onPress={() => startGroup(g)}
                      />
                      <TextAction
                        icon={Trash2}
                        destructive
                        title={`Delete ${g.name}`}
                        disabled={busy}
                        onPress={() => removeGroup(g)}
                      />
                    </>
                  )}
                </View>
              ))}
            {!choosing && groups.length === 0 && (
              <Copy>No groups yet. Start with the people you see most.</Copy>
            )}
            {choosing && (
              <>
                {editing && (
                  <Field
                    label="Group name"
                    value={groupName}
                    onChangeText={(v) => {
                      setGroupName(v);
                      setDirty(true);
                    }}
                    maxLength={80}
                    editable={!busy}
                  />
                )}
                <Title style={{ fontSize: 23 }}>
                  Selected · {selected.length}
                </Title>
                <View style={{ gap: 6 }}>
                  {selected.map((p) => row(p, true))}
                </View>
                {selected.length === 0 && (
                  <Copy style={s.muted}>
                    Choose contacts or add someone below.
                  </Copy>
                )}
                <ActionGroup>
                  <ActionRow
                    icon={ContactRound}
                    title="Choose phone contacts"
                    loading={busy}
                    onPress={() => void loadContacts()}
                  />
                  {Platform.OS !== "web" && (
                    <TextAction
                      icon={Settings2}
                      title="Contact access settings"
                      disabled={busy}
                      onPress={() =>
                        void Linking.openSettings().catch(() =>
                          setError("Could not open Settings."),
                        )
                      }
                    />
                  )}
                </ActionGroup>
                {limited && (
                  <>
                    <Copy style={s.muted}>
                      Only contacts you allowed are shown.
                    </Copy>
                    <Button
                      title="Allow more contacts"
                      secondary
                      disabled={busy}
                      onPress={() => void loadContacts(0, true)}
                    />
                  </>
                )}
                {missing > 0 && (
                  <Copy style={s.muted}>
                    {missing} contacts without a usable email or phone were
                    skipped.
                  </Copy>
                )}
                {contacts.length > 0 && (
                  <Field
                    label="Search loaded contacts"
                    value={query}
                    onChangeText={setQuery}
                  />
                )}
                {contacts
                  .filter(
                    (p) =>
                      !selected.some((x) => x.key === p.key) &&
                      `${p.name} ${p.address}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((p) => row(p, false))}
                {more && (
                  <Button
                    title="Load more contacts"
                    secondary
                    disabled={busy}
                    onPress={() => void loadContacts(offset)}
                  />
                )}
                <View style={[s.card, { padding: 18, gap: 14 }]}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <IconBadge icon={UserPlus} tone="rose" />
                    <Copy style={{ flex: 1 }}>Add someone yourself.</Copy>
                  </View>
                  <Field
                    label="Person’s name"
                    value={name}
                    onChangeText={(value) => {
                      setName(value);
                      setDirty(true);
                    }}
                    maxLength={80}
                    editable={!busy}
                  />
                  <Field
                    label="Email or phone"
                    value={address}
                    onChangeText={(value) => {
                      setAddress(value);
                      setDirty(true);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={254}
                    editable={!busy}
                  />
                  <TextAction
                    icon={Plus}
                    title="Add person"
                    disabled={busy}
                    onPress={addManual}
                  />
                </View>
                <Copy style={s.muted}>
                  People sharing the same email or phone appear once. Choose one
                  contact detail for each person.
                </Copy>
                <Button
                  title={editing ? "Save group" : "Save people"}
                  onPress={save}
                  loading={busy}
                />
                {planId && !dirty && (
                  <ActionRow
                    icon={Mail}
                    title="Review invitations"
                    disabled={busy}
                    onPress={() =>
                      router.navigate({
                        pathname: "/invitations",
                        params: { plan: planId },
                      })
                    }
                  />
                )}
                {planId && (
                  <Copy style={s.muted}>
                    {preview
                      ? "Preview invitations remain disabled."
                      : "Review invitations to prepare a separate link for each person. Nothing is sent automatically."}
                  </Copy>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
