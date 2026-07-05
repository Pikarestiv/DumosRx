import { create } from 'zustand';

interface OnlineOrdersModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export const useOnlineOrdersModal = create<OnlineOrdersModalStore>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));
