import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, storage } from "../services/supabase";
export type LocalPlan = {
  id: string;
  activity_id: string;
  starts_at: string;
  place_label: string;
  note: string;
  status: string;
  version: number;
  owner_id?: string;
  time_zone?: string;
};
const State = createContext<{
  session: Session | null;
  restoring: boolean;
  pendingInvite: string | null;
  rememberInvite: (token: string | null) => Promise<void>;
  preview: boolean;
  setPreview: (x: boolean) => void;
  localPlans: LocalPlan[];
  setLocalPlans: React.Dispatch<React.SetStateAction<LocalPlan[]>>;
  signOut: () => Promise<void>;
}>({
  session: null,
  restoring: true,
  pendingInvite: null,
  rememberInvite: async () => {},
  preview: false,
  setPreview: () => {},
  localPlans: [],
  setLocalPlans: () => {},
  signOut: async () => {},
});
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const rememberInvite = async (token: string | null) => {
    if (token) await storage.setItem("resbite.pending-invite", token);
    else await storage.removeItem("resbite.pending-invite");
    setPendingInvite(token);
  };
  useEffect(() => {
    storage
      .getItem("resbite.pending-invite")
      .then(setPendingInvite)
      .catch(() => {});
  }, []);
  const [session, setSession] = useState<Session | null>(null),
    [restoring, setRestoring] = useState(true),
    [preview, setPreview] = useState(false),
    [localPlans, setLocalPlans] = useState<LocalPlan[]>([]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => active && setRestoring(false), 6000);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
          setRestoring(false);
        }
      })
      .catch(() => active && setRestoring(false));
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      setSession(value);
      setRestoring(false);
    });
    return () => {
      active = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await rememberInvite(null);
    setSession(null);
    setPreview(false);
    setLocalPlans([]);
  };
  return (
    <State.Provider
      value={{
        session,
        restoring,
        pendingInvite,
        rememberInvite,
        preview,
        setPreview,
        localPlans,
        setLocalPlans,
        signOut,
      }}
    >
      {children}
    </State.Provider>
  );
}
export const useApp = () => useContext(State);
