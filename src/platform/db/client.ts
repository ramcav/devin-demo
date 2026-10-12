import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Conn = { sql: postgres.Sql; db: Db };

const globalForDb = globalThis as unknown as { __db?: Conn };

export function connect(url: string): Conn {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
}

function conn(): Conn {
  if (!globalForDb.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__db = connect(url);
  }
  return globalForDb.__db;
}

export function getDb(): Db {
  return conn().db;
}

export function getSql(): postgres.Sql {
  return conn().sql;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__db) {
    await globalForDb.__db.sql.end();
    globalForDb.__db = undefined;
  }
}
