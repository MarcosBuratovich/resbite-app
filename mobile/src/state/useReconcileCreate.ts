import { useEffect, useRef } from "react";
import { useApp } from "./AppState";
import { createJournal } from "../services/journal";
import { planGateway } from "../services/plans";
import { reconcilePendingCreate } from "../services/pendingCreate";

/**
 * A create whose reply was lost is finished when the tabs open, once per account, whichever tab the app opens on.
 * Reading first means it never creates twice; the plan it finds is kept in app state for My resbites to announce.
 */
export function useReconcileCreate() {
  const { preview, session, setCreatedPlan } = useApp();
  const scope = preview ? "preview" : session?.user.id;
  const ran = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!scope) ran.current = undefined;
    if (!scope || scope === "preview" || ran.current === scope) return;
    ran.current = scope;
    void reconcilePendingCreate(scope, planGateway, createJournal)
      .then(({ plan }) => {
        if (plan) setCreatedPlan({ scope, title: plan.title });
      })
      .catch(() => {
        // A read that failed (offline at launch) says nothing about the outcome: the next mount of the tabs or
        // the next account change tries again.
        if (ran.current === scope) ran.current = undefined;
      });
  }, [scope, setCreatedPlan]);
}
