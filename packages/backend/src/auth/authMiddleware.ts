import type { NextFunction, Request, Response } from "express";
import { parseCookies } from "./cookies";
import { getUserForSession, SESSION_COOKIE_NAME, type SessionUser } from "./sessions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const user = await getUserForSession(cookies[SESSION_COOKIE_NAME]);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.user = user;
  next();
}

/** Same check, usable outside Express middleware (e.g. the WebSocket upgrade
 * handshake, which never goes through Express's request pipeline). */
export async function authenticateFromCookieHeader(cookieHeader: string | undefined): Promise<SessionUser | null> {
  const cookies = parseCookies(cookieHeader);
  return getUserForSession(cookies[SESSION_COOKIE_NAME]);
}
