import { create } from "zustand";
import type { AssistantMessage } from "@/lib/assistant/types";

export interface AssistantPanelStore {
  isOpen: boolean;
  messages: AssistantMessage[];
  open: () => void;
  close: () => void;
  append: (msg: AssistantMessage) => void;
  clear: () => void;
}

export const useAssistantPanel = create<AssistantPanelStore>((set) => ({
  isOpen: false,
  messages: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  append: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clear: () => set({ messages: [] }),
}));
