import { storage } from "./supabase";
import { createConfirmationStore } from "./confirmationFlow";

export const confirmationStore = createConfirmationStore(storage);
