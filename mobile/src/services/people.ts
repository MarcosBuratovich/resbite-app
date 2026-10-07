import { storage } from "./supabase";
import { createPeopleStore } from "./peopleStore";
export const peopleStore = createPeopleStore(storage);
