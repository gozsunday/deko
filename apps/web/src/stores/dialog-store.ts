import { z } from "zod";
import { create } from "zustand";

import { ServiceTokenPublicSchema } from "@repo/db/validators/service.validator";

export type TokenDialogPayload = z.infer<typeof ServiceTokenPublicSchema>;

export type AppDialogState =
  | { type: "create-service" }
  | { type: "create-token"; serviceId: string }
  | { type: "rename-token"; token: TokenDialogPayload }
  | { type: "rotate-token"; token: TokenDialogPayload }
  | { type: "revoke-token"; token: TokenDialogPayload }
  | { type: "delete-service"; serviceId: string; serviceName: string };

type DialogStore = {
  activeDialog: AppDialogState | null;
  openDialog: (dialog: AppDialogState) => void;
  closeDialog: () => void;
};

export const useDialogStore = create<DialogStore>((set) => ({
  activeDialog: null,
  openDialog: (dialog) => set({ activeDialog: dialog }),
  closeDialog: () => set({ activeDialog: null }),
}));
