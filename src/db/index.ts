import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "@/server/env";
import * as schema from "./schema";

let pool: mysql.Pool | null = null;

export function getPool() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!env.databaseUrl.startsWith("mysql")) {
    throw new Error("DATABASE_URL must be a mysql:// connection string");
  }
  if (!pool) {
    pool = mysql.createPool({
      uri: env.databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema, mode: "default" });
}

export type Db = ReturnType<typeof getDb>;
