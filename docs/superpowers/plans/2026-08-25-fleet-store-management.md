# Fleet (Store Fleet) Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real store CRUD management (list/create/edit/delete) into `client/`'s Settings > Store Profile tab, replacing the current link-out-only stub, so `web/`'s equivalent fleet-management dashboard becomes redundant.

**Architecture:** Online-only, direct API calls — no local SQLite table, no sync-engine involvement (creating/editing/deleting a store is an inherently connected, account-level action with no offline use case). No per-store stock/activity/transaction detail tabs — the header's existing store switcher already surfaces a store's live data once you switch into it, so duplicating those tabs here would be redundant.

**Tech Stack:** Next.js 14 (App Router, static export) + React, `client/`'s existing fetch-based `ApiClient`/`BaseApiClient`, Vitest for API-client unit tests, shadcn/ui components (`ResponsiveModal`, `ConfirmDialog`, `Table`) matching existing Settings conventions.

**Spec:** `docs/superpowers/specs/2026-08-25-dashboard-feature-migration-design.md`, Section B.

## Global Constraints

- Fleet writes are online-only: no local SQLite table, no sync-engine involvement, matching the spec's architecture section (store CRUD has no offline use case).
- Store payload fields are exactly `{ name: string; location?: string; address?: string; phone?: string; store_type?: string }` — `store_type` one of `pharmacy | supermarket | grocery | general | retail`, matching `laravel-server`'s validation in `Api/Web/StoreController.php` exactly. Do not invent additional fields.
- No new react-query/hook layer: cloud-only store data is fetched with plain `useState`/`useEffect` + direct `apiClient` calls, matching the existing precedent in `client/app/setup/use-onboarding.ts` — the `lib/hooks/queries/*` layer in this codebase is reserved for local-SQLite-backed data (staff/users), not cloud-only resources.
- Reuse existing dialog primitives (`ResponsiveModal` for forms, `ConfirmDialog` for delete confirmation) — these are the established pattern in `client/components/settings/staff/*`, not a new dialog implementation.
- The feature-gate-locked branch of `MultiStoreCard` (shown when `canManageMultiStore` is false) is untouched by this plan — its upgrade-CTA link target belongs to the separate Billing plan's cross-cutting retargeting task, not this one.

---

### Task 1: Fleet API client methods

**Files:**
- Modify: `client/lib/api/client.ts:313-320` (add methods immediately after `checkStoreSlug`)
- Modify: `client/lib/types/store.ts` (add `FleetStore`/`FleetStorePayload` types alongside the existing `StoreOption`)
- Test: `client/__tests__/fleet-client.test.ts`

**Interfaces:**
- Produces: `apiClient.createStore(payload: FleetStorePayload): Promise<{ message: string; store: FleetStore }>`, `apiClient.updateStore(id: string, payload: FleetStorePayload): Promise<{ message: string; store: FleetStore }>`, `apiClient.deleteStore(id: string): Promise<{ message: string }>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('fleet store API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createStore posts to /stores with the store payload', async () => {
    const store = { id: '1', name: 'Main Branch', location: 'Lagos', address: null, phone: null, store_type: 'pharmacy' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Store registered successfully', store }),
    });

    const result = await apiClient.createStore({ name: 'Main Branch', location: 'Lagos', store_type: 'pharmacy' });

    expect(result).toEqual({ message: 'Store registered successfully', store });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/stores');
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body)).toEqual({ name: 'Main Branch', location: 'Lagos', store_type: 'pharmacy' });
  });

  it('updateStore puts to /stores/:id with the store payload', async () => {
    const store = { id: '1', name: 'Main Branch Updated', location: 'Lagos', address: null, phone: null, store_type: 'pharmacy' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Store updated successfully', store }),
    });

    const result = await apiClient.updateStore('1', { name: 'Main Branch Updated', store_type: 'pharmacy' });

    expect(result).toEqual({ message: 'Store updated successfully', store });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/stores/1');
    expect(config.method).toBe('PUT');
    expect(JSON.parse(config.body)).toEqual({ name: 'Main Branch Updated', store_type: 'pharmacy' });
  });

  it('deleteStore deletes /stores/:id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Store removed successfully' }),
    });

    const result = await apiClient.deleteStore('1');

    expect(result).toEqual({ message: 'Store removed successfully' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/stores/1');
    expect(config.method).toBe('DELETE');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/fleet-client.test.ts`
Expected: FAIL — `apiClient.createStore is not a function`.

- [ ] **Step 3: Add the `FleetStore` type**

In `client/lib/types/store.ts`, add below the existing `StoreOption`:

```ts
/** Fields returned/accepted by the fleet-management (Settings > Store Profile)
 * store CRUD endpoints — matches the server's Store model validation in
 * laravel-server's Api/Web/StoreController. */
export interface FleetStore {
  id: string;
  name: string;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  store_type?: string | null;
}

export interface FleetStorePayload {
  name: string;
  location?: string;
  address?: string;
  phone?: string;
  store_type?: string;
}
```

- [ ] **Step 4: Implement the methods**

In `client/lib/api/client.ts`, add immediately after `checkStoreSlug` (after line 320):

```ts
  async createStore(payload: FleetStorePayload) {
    return this.request<{ message: string; store: FleetStore }>("/stores", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateStore(id: string, payload: FleetStorePayload) {
    return this.request<{ message: string; store: FleetStore }>(`/stores/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async deleteStore(id: string) {
    return this.request<{ message: string }>(`/stores/${id}`, {
      method: "DELETE",
    });
  }
```

Add the import at the top of the file alongside the other type imports (near `import type { StoreOption } from "@/lib/types/store";`):

```ts
import type { FleetStore, FleetStorePayload } from "@/lib/types/store";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/fleet-client.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add client/lib/api/client.ts client/lib/types/store.ts client/__tests__/fleet-client.test.ts
git commit -m "feat(client): add fleet store create/update/delete API methods"
```

---

### Task 2: Fleet list component

**Files:**
- Create: `client/components/settings/store/fleet-list.tsx`

**Interfaces:**
- Consumes: `FleetStore` (Task 1)
- Produces: `FleetList({ stores, isLoading, onEdit, onDelete }: FleetListProps)` — `onEdit: (store: FleetStore) => void`, `onDelete: (id: string, name: string) => void`

- [ ] **Step 1: Create the component**

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, Loader2, Store as StoreIcon } from "lucide-react";
import type { FleetStore } from "@/lib/types/store";

interface FleetListProps {
  stores: FleetStore[];
  isLoading: boolean;
  onEdit: (store: FleetStore) => void;
  onDelete: (id: string, name: string) => void;
}

function NoStoresRow() {
  return (
    <TableRow>
      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
        <StoreIcon className="w-6 h-6 mx-auto mb-2 opacity-30" />
        No stores found.
      </TableCell>
    </TableRow>
  );
}

export function FleetList({ stores, isLoading, onEdit, onDelete }: FleetListProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </TableCell>
          </TableRow>
        )}
        {!isLoading && stores.length === 0 && <NoStoresRow />}
        {!isLoading &&
          stores.map((store) => (
            <TableRow key={store.id}>
              <TableCell className="font-medium">{store.name}</TableCell>
              <TableCell>{store.location || "—"}</TableCell>
              <TableCell className="capitalize">{store.store_type || "—"}</TableCell>
              <TableCell className="text-right space-x-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(store)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(store.id, store.name)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Manual verification**

`client/` has no component-level UI test suite (staff's list/dialog components have none either — this matches existing convention). Verify manually once Task 5 wires this in: `cd client && npm run dev`, open Settings > Store Profile, confirm the table renders with columns Name/Location/Type/Actions and an empty state when there are no stores.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/store/fleet-list.tsx
git commit -m "feat(client): add fleet store list component"
```

---

### Task 3: Fleet create/edit form dialog

**Files:**
- Create: `client/components/settings/store/fleet-form-dialog.tsx`

**Interfaces:**
- Consumes: `apiClient.createStore`/`updateStore` (Task 1), `ResponsiveModal` (`client/components/ui/responsive-modal.tsx`)
- Produces: `FleetFormDialog({ isOpen, onOpenChange, storeToEdit, onSuccess }: FleetFormDialogProps)`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import type { FleetStore } from "@/lib/types/store";

const STORE_TYPES = ["pharmacy", "supermarket", "grocery", "general", "retail"] as const;

interface FleetFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  storeToEdit?: FleetStore | null;
  onSuccess: () => void;
}

export function FleetFormDialog({
  isOpen,
  onOpenChange,
  storeToEdit,
  onSuccess,
}: FleetFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!storeToEdit;
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    address: "",
    phone: "",
    store_type: "pharmacy",
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: storeToEdit?.name || "",
        location: storeToEdit?.location || "",
        address: storeToEdit?.address || "",
        phone: storeToEdit?.phone || "",
        store_type: storeToEdit?.store_type || "pharmacy",
      });
    }
  }, [isOpen, storeToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Store name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && storeToEdit) {
        await apiClient.updateStore(storeToEdit.id, formData);
        toast.success("Store details updated successfully");
      } else {
        await apiClient.createStore(formData);
        toast.success("New store registered successfully");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save store");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit Store Details" : "Register New Store"}
      description={
        isEditing
          ? "Update the information for this store location."
          : "Expand your fleet by adding a new store instance."
      }
      footer={
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="fleet-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? "Save Changes" : "Register Store"}
          </Button>
        </DialogFooter>
      }
    >
      <form id="fleet-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Store Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="store_type">Store Type</Label>
          <Select
            value={formData.store_type}
            onValueChange={(val) => setFormData({ ...formData, store_type: val })}
          >
            <SelectTrigger id="store_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STORE_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="capitalize">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </form>
    </ResponsiveModal>
  );
}
```

- [ ] **Step 2: Manual verification**

Once Task 5 wires this in: `cd client && npm run dev`, open Settings > Store Profile, click "Add Store", fill in a name, submit. Expected: success toast, dialog closes, new store appears in the list. Repeat for edit (pre-filled fields) and for the empty-name validation error.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/store/fleet-form-dialog.tsx
git commit -m "feat(client): add fleet store create/edit form dialog"
```

---

### Task 4: Fleet delete confirmation dialog

**Files:**
- Create: `client/components/settings/store/fleet-delete-dialog.tsx`

**Interfaces:**
- Consumes: `apiClient.deleteStore` (Task 1), `ConfirmDialog` (`client/components/ui/confirm-dialog.tsx`)
- Produces: `FleetDeleteDialog({ target, onClose, onSuccess }: FleetDeleteDialogProps)` — `target: { id: string; name: string } | null`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface FleetDeleteDialogProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function FleetDeleteDialog({ target, onClose, onSuccess }: FleetDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeleteStore = async () => {
    if (!target) return;
    setIsDeleting(true);
    try {
      await apiClient.deleteStore(target.id);
      toast.success("Store removed successfully");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove store");
    } finally {
      setIsDeleting(false);
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeleteStore}
      title="Delete Store"
      description={`Are you sure you want to delete "${target?.name}"? This also deactivates all staff assigned to this store. This action cannot be undone.`}
      confirmLabel={isDeleting ? "Deleting..." : "Delete Store"}
      variant="destructive"
    />
  );
}
```

- [ ] **Step 2: Manual verification**

Once Task 5 wires this in: click delete on a store, confirm the dialog copy mentions staff deactivation, confirm, verify the store disappears from the list and a success toast appears.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/store/fleet-delete-dialog.tsx
git commit -m "feat(client): add fleet store delete confirmation dialog"
```

---

### Task 5: Wire Fleet management into `MultiStoreCard`

**Files:**
- Modify: `client/components/settings/store/multi-store-card.tsx` (full rewrite of the unlocked branch)

**Interfaces:**
- Consumes: `apiClient.getStores` (existing), `FleetList` (Task 2), `FleetFormDialog` (Task 3), `FleetDeleteDialog` (Task 4)

Only the `canManageMultiStore === true` branch changes — the locked/upgrade branch (shown when the feature gate blocks multi-store) is left exactly as-is; its link target is out of scope here (owned by the Billing plan's retargeting task).

- [ ] **Step 1: Replace the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Store, Lock, Plus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { WEB_APP_URL } from "@/lib/constants";
import { apiClient } from "@/lib/api/client";
import type { FleetStore } from "@/lib/types/store";
import { FleetList } from "./fleet-list";
import { FleetFormDialog } from "./fleet-form-dialog";
import { FleetDeleteDialog } from "./fleet-delete-dialog";

export function MultiStoreCard() {
  const { canManageMultiStore, getUpgradeMessage } = useFeatureGate();
  const [stores, setStores] = useState<FleetStore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [storeToEdit, setStoreToEdit] = useState<FleetStore | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const loadStores = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getStores();
      setStores(data as unknown as FleetStore[]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canManageMultiStore) {
      loadStores();
    }
  }, [canManageMultiStore]);

  if (!canManageMultiStore) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multiple Stores</CardTitle>
          <CardDescription>
            Run more than one location under the same account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10 shrink-0">
                <Store className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Multi-store locked</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {getUpgradeMessage(
                    "multi_store",
                    "Running multiple stores is available on higher plans.",
                  )}
                </p>
              </div>
            </div>
            <Button variant="default" className="shrink-0" asChild>
              <a href={`${WEB_APP_URL}/dashboard/billing`} target="_blank" rel="noopener noreferrer">
                <Lock className="h-4 w-4 mr-2" />
                Upgrade Plan
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Multiple Stores</CardTitle>
          <CardDescription>Manage every store location on this account.</CardDescription>
        </div>
        <Button
          onClick={() => {
            setStoreToEdit(null);
            setIsFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Store
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <FleetList
          stores={stores}
          isLoading={isLoading}
          onEdit={(store) => {
            setStoreToEdit(store);
            setIsFormOpen(true);
          }}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
        />
      </CardContent>

      <FleetFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        storeToEdit={storeToEdit}
        onSuccess={loadStores}
      />
      <FleetDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSuccess={loadStores}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Build to confirm the static export succeeds**

Run: `cd client && npm run build`
Expected: succeeds (pure client-component change, no new routes).

- [ ] **Step 3: Manual end-to-end verification**

Run: `cd client && npm run dev`. With a store-owner account whose plan allows multi-store (`canManageMultiStore` true), go to Settings > Store Profile. Expected: the Multiple Stores card shows a live table of stores (not the old "Open Dashboard" link), "Add Store" opens the create dialog, editing/deleting a row works end-to-end against the live API. With a plan that blocks multi-store, the card should show the unchanged locked/upgrade state.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/store/multi-store-card.tsx
git commit -m "feat(client): wire fleet store management into Settings > Store Profile"
```
