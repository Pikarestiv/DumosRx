import { useMemo, useState } from "react";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import {
  ALL_AUDIT_CATEGORIES,
  AUDIT_SORT_ACCESSORS,
  buildAuditCategoryOptions,
  matchesAuditStatus,
  selectAuditCategoryItems,
  selectAuditStatusItems,
  type AuditCountStatus,
  type AuditLens,
} from "@/components/stock-batch/audit-derivations";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useSortableData } from "./use-sortable-data";

export function useAuditLedgerLens(items: AuditItem[]) {
  const [selectedCategory, setSelectedCategory] = useState(ALL_AUDIT_CATEGORIES);
  const [search, setSearch] = useState("");
  const [countStatus, setCountStatus] = useState<AuditCountStatus>("all");

  const lens = useMemo<AuditLens>(
    () => ({ category: selectedCategory, status: countStatus, search }),
    [selectedCategory, countStatus, search],
  );

  const categories = useMemo(() => buildAuditCategoryOptions(items), [items]);

  const categoryItems = useMemo(
    () => selectAuditCategoryItems(items, selectedCategory),
    [items, selectedCategory],
  );

  // Sticky rows, re-taken during render on a lens change (why not an effect: client/AGENTS.md).
  // Rationale: docs/CLIENT_COMMENTS.md#stock-audits-ledger-lens
  const lensKey = `${countStatus}|${selectedCategory}|${search}`;
  const [stickyRows, setStickyRows] = useState<{
    key: string;
    ids: Set<string>;
  }>({ key: lensKey, ids: new Set() });
  if (stickyRows.key !== lensKey) {
    setStickyRows({
      key: lensKey,
      ids: new Set(selectAuditStatusItems(items, countStatus).map((i) => i.id)),
    });
  }
  const stickyRowIds = stickyRows.ids;

  const statusItems = useMemo(
    () =>
      countStatus === "all"
        ? categoryItems
        : categoryItems.filter(
            (item) =>
              stickyRowIds.has(item.id) || matchesAuditStatus(item, countStatus),
          ),
    [categoryItems, countStatus, stickyRowIds],
  );

  const filteredList = useMemo(
    () => genericFuzzySearch(search, statusItems, ["name", "sku"]).results,
    [search, statusItems],
  );

  const { sortKey, direction, toggleSort, sortedData } = useSortableData(
    filteredList,
    AUDIT_SORT_ACCESSORS,
  );

  const exportItems = useMemo(
    () => sortedData.filter((item) => matchesAuditStatus(item, countStatus)),
    [sortedData, countStatus],
  );

  const resetLens = () => {
    setSelectedCategory(ALL_AUDIT_CATEGORIES);
    setCountStatus("all");
    setSearch("");
  };

  return {
    lens,
    selectedCategory,
    setSelectedCategory,
    search,
    setSearch,
    countStatus,
    setCountStatus,
    resetLens,
    categories,
    visibleItems: sortedData,
    sort: { sortKey, direction, toggleSort },
    exportItems,
  };
}
