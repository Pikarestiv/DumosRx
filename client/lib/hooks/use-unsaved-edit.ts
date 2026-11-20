import { useEffect } from "react";

const unsavedEdits = new Set<symbol>();

const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = "";
};

export const hasUnsavedEdits = () => unsavedEdits.size > 0;

export const discardAllUnsavedEdits = () => unsavedEdits.clear();

export function useUnsavedEdit(isUnsaved: boolean) {
  useEffect(() => {
    if (!isUnsaved) return;
    const id = Symbol("unsaved-edit");
    unsavedEdits.add(id);
    if (unsavedEdits.size === 1) window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      unsavedEdits.delete(id);
      if (unsavedEdits.size === 0) window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [isUnsaved]);
}
