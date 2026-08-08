import { z } from "zod";

export const setupSchema = z
  .object({
    username: z.string().trim().min(3).max(64),
    password: z.string().min(8).max(200),
  })
  .strict();

export const loginSchema = z
  .object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(200),
  })
  .strict();

export const createUserSchema = z
  .object({
    username: z.string().trim().min(3).max(64),
    password: z.string().min(8).max(200),
  })
  .strict();

export const createTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    scope: z.enum(["read", "write"]),
  })
  .strict();
