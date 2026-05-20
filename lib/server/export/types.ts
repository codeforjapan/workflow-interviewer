import type { InferSelectModel } from "drizzle-orm";
import type { sessions } from "@/lib/db/schema";

export type Session = InferSelectModel<typeof sessions>;
