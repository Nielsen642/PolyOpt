import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { AuthUser } from "@shared/schema";
import { pool } from "./db";

declare module "express-session" {
  interface SessionData {
    user?: AuthUser;
  }
}

const PostgresStore = connectPgSimple(session);

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "polyopt-dev-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 12,
  },
  store: new PostgresStore({
    pool,
    createTableIfMissing: true,
    tableName: "user_session",
  }),
});
