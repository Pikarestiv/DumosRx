"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateId } from "@/lib/db/core";
import { getPurchaseOrderById, type PurchaseOrder } from "@/lib/db/procurement";
import { getOrderTotal } from "../po-line-item-math";
import type { POLineItemDraft } from "../po-item-ledger-table";
import { draftFromOrder, newDraft, remapLineIds, withSupplier } from "./po-draft-snapshot";
import { recordUndo, revertField, takeUndo, type PoDraft, type RevertableField, type SaveMode, type UndoHistory } from "./po-draft-state";
import { usePoAutosave } from "./use-po-autosave";

export const EDITABLE_ORDER_STATUSES = new Set(["pending", "sent"]);

interface UsePoOrderEditorOptions {
  initialId: string | null;
  defaultSupplierId?: string | null;
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

export function usePoOrderEditor({ initialId, defaultSupplierId }: UsePoOrderEditorOptions) {
  const [orderId, setOrderId] = useState(() => initialId ?? generateId());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">(initialId ? "loading" : "ready");
  const [status, setStatus] = useState("pending");
  const [draft, setDraftState] = useState<PoDraft>(() => newDraft(defaultSupplierId || undefined));
  const draftRef = useRef(draft);
  const historyRef = useRef<UndoHistory>({ stack: [], lastPushAt: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [baseline, setBaseline] = useState<Map<string, POLineItemDraft>>(new Map());

  const setDraft = useCallback((next: PoDraft) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const autosave = usePoAutosave({
    orderId,
    draftRef,
    initiallyPersisted: !!initialId,
    enabled: loadState === "ready" && EDITABLE_ORDER_STATUSES.has(status),
    onLineIdsRemapped: (idMap) => setDraft(remapLineIds(draftRef.current, idMap)),
    onCreated: () => window.history.replaceState(null, "", `/procurement/edit?id=${orderId}`),
  });

  const seed = useCallback((po: PurchaseOrder) => {
    const opened = draftFromOrder(po);
    setDraft(opened);
    setStatus(po.status);
    setBaseline(new Map(opened.items.filter((item) => item.id).map((item) => [item.id as string, item])));
    historyRef.current = { stack: [], lastPushAt: 0 };
    setCanUndo(false);
  }, [setDraft]);

  const reload = useCallback(async () => {
    const po = await getPurchaseOrderById(orderId);
    if (!po) {
      setLoadState("missing");
      return null;
    }
    seed(po);
    setLoadState("ready");
    return po;
  }, [orderId, seed]);

  useEffect(() => {
    if (!initialId) return;
    getPurchaseOrderById(initialId)
      .then((po) => {
        if (!po) {
          setLoadState("missing");
          return;
        }
        seed(po);
        setLoadState("ready");
      })
      .catch((err) => {
        console.error("Failed to load purchase order", err);
        setLoadState("error");
      });
  }, [initialId, seed]);

  const change = useCallback((update: (current: PoDraft) => PoDraft, mode: SaveMode) => {
    const previous = draftRef.current;
    const next = update(previous);
    if (next === previous) return;
    historyRef.current = recordUndo(historyRef.current, previous, Date.now(), mode);
    setCanUndo(true);
    setDraft(next);
    autosave.scheduler.request(mode);
  }, [autosave.scheduler, setDraft]);

  const undo = useCallback(() => {
    const { history, draft: previous } = takeUndo(historyRef.current);
    historyRef.current = history;
    setCanUndo(history.stack.length > 0);
    if (!previous) return false;
    setDraft(previous);
    autosave.scheduler.request("now");
    return true;
  }, [autosave.scheduler, setDraft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      if (isTextEditingTarget(event.target)) return;
      if (undo()) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  const revert = useCallback((lineId: string, field: RevertableField) => {
    const opened = baseline.get(lineId);
    if (!opened) return;
    change((current) => ({ ...current, items: revertField(current.items, lineId, field, opened) }), "now");
  }, [baseline, change]);

  const startCopy = useCallback(() => {
    const copyId = generateId();
    const copy = { ...draftRef.current, items: draftRef.current.items.map((item) => ({ ...item, id: generateId() })) };
    setOrderId(copyId);
    setStatus("pending");
    setBaseline(new Map());
    setDraft(copy);
    return copyId;
  }, [setDraft]);

  return {
    orderId,
    loadState,
    status,
    setStatus,
    draft,
    draftRef,
    baseline,
    canUndo,
    totalAmount: getOrderTotal(draft.items),
    isEditable: EDITABLE_ORDER_STATUSES.has(status),
    change,
    undo,
    revert,
    reload,
    startCopy,
    setSupplier: (id: string) => change((current) => withSupplier(current, id), "now"),
    autosave,
  };
}
