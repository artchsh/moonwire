import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { HonoEnv } from "../../types";
import { ApiError } from "../../lib/errors";
import {
  SESSION_COOKIE,
  issueSessionCookie,
  clearSessionCookie,
  enforceOrigin,
  requireAdmin,
  resolvePrincipal,
} from "../../lib/auth";
import { setupSchema, loginSchema, createTokenSchema, createUserSchema } from "./schemas";
import * as service from "./service";
import type { SessionInfo } from "../../../shared/api";

export const authRouter = new Hono<HonoEnv>();

authRouter.get("/auth/session", async (c) => {
  const setupComplete = await service.isSetupComplete(c.var.db);
  const info: SessionInfo = {
    authenticated: false,
    setupRequired: !setupComplete,
  };
  const resolved = await resolvePrincipal(c);
  if (resolved?.kind === "admin") {
    info.authenticated = true;
    info.username = resolved.username;
  }
  return c.json(info);
});

authRouter.post("/auth/setup", async (c) => {
  enforceOrigin(c);
  const body = setupSchema.parse(await c.req.json());
  await service.createAdmin(c.var.db, body.username, body.password);
  const adminId = await service.verifyLogin(c.var.db, body.username, body.password);
  if (!adminId) throw new ApiError("INTERNAL_ERROR", "Setup succeeded but login failed");
  const token = await service.createSession(c.var.db, adminId, c.var.config.sessionTtlMs);
  issueSessionCookie(c, token);
  const info: SessionInfo = { authenticated: true, setupRequired: false, username: body.username };
  return c.json(info, 201);
});

authRouter.post("/auth/login", async (c) => {
  enforceOrigin(c);
  const body = loginSchema.parse(await c.req.json());
  const adminId = await service.verifyLogin(c.var.db, body.username, body.password);
  if (!adminId) throw new ApiError("UNAUTHENTICATED", "Invalid username or password");
  const token = await service.createSession(c.var.db, adminId, c.var.config.sessionTtlMs);
  issueSessionCookie(c, token);
  const info: SessionInfo = { authenticated: true, setupRequired: false, username: body.username };
  return c.json(info);
});

authRouter.post("/auth/logout", async (c) => {
  enforceOrigin(c);
  const cookie = getCookie(c, SESSION_COOKIE);
  if (cookie) await service.destroySession(c.var.db, cookie);
  clearSessionCookie(c);
  return c.body(null, 204);
});

authRouter.get("/users", requireAdmin, async (c) => {
  return c.json({ users: await service.listUsers(c.var.db) });
});

authRouter.post("/users", requireAdmin, async (c) => {
  const body = createUserSchema.parse(await c.req.json());
  const user = await service.createUser(c.var.db, body.username, body.password);
  return c.json(user, 201);
});

authRouter.delete("/users/:id", requireAdmin, async (c) => {
  await service.deleteUser(c.var.db, c.req.param("id"), c.var.principal!.id);
  return c.body(null, 204);
});

authRouter.get("/tokens", requireAdmin, async (c) => {
  return c.json({ tokens: await service.listTokens(c.var.db) });
});

authRouter.post("/tokens", requireAdmin, async (c) => {
  const body = createTokenSchema.parse(await c.req.json());
  const created = await service.createToken(c.var.db, body.name, body.scope);
  return c.json(created, 201);
});

authRouter.delete("/tokens/:id", requireAdmin, async (c) => {
  await service.deleteToken(c.var.db, c.req.param("id"));
  return c.body(null, 204);
});
