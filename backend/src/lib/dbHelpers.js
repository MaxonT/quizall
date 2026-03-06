/**
 * 统一 DB 访问层：SQLite 同步 / PostgreSQL 异步
 * 所有需兼容 PG 的路由应使用本模块，避免在 PG 下误用 db.prepare() 返回的 Promise
 */
import { db } from "./db.js";

export const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

export async function dbGet(sql, params = []) {
  if (USE_POSTGRES) return await db.get(sql, ...params);
  return db.prepare(sql).get(...params);
}

export async function dbRun(sql, params = []) {
  if (USE_POSTGRES) return await db.run(sql, ...params);
  return db.prepare(sql).run(...params);
}

export async function dbAll(sql, params = []) {
  if (USE_POSTGRES) return await db.all(sql, ...params);
  return db.prepare(sql).all(...params);
}
