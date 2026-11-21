import { useEffect } from "react";

const unsavedEdits = new Set<symbol>();
let pageUrlWhenEdited = "";

const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (unsavedEdits.size === 0) return;
  event.preventDefault();
  event.returnValue = "";
};

export const hasUnsavedEdits = () => unsavedEdits.size > 0;

export const discardAllUnsavedEdits = () => unsavedEdits.clear();

export const urlWhereEditsAreUnsaved = () => pageUrlWhenEdited;

export function useUnsavedEdit(isUnsaved: boolean) {
  useEffect(() => {
    if (!isUnsaved) return;
    const id = Symbol("unsaved-edit");
    if (unsavedEdits.size === 0) pageUrlWhenEdited = window.location.href;
    unsavedEdits.add(id);
    if (unsavedEdits.size === 1) window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      unsavedEdits.delete(id);
      if (unsavedEdits.size === 0) window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [isUnsaved]);
}
