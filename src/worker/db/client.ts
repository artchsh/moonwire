import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof openDatabase>;

/** Wrap a D1 binding in a typed Drizzle client. */
export function openDatabase(d1: D1Database) {
  return drizzle(d1, { schema });
}

export { schema };
