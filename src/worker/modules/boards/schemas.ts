import { z } from "zod";

const name = z.string().trim().min(1).max(120);
const version = z.number().int().nonnegative();
const optionalId = z.string().min(1).nullish();

export const createBoardSchema = z.object({ name }).strict();
export const updateBoardSchema = z.object({ name: name.optional(), version }).strict();

export const createColumnSchema = z.object({ name }).strict();
export const updateColumnSchema = z.object({ name: name.optional(), version }).strict();

export const createCardSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).optional(),
  })
  .strict();

export const updateCardSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20_000).optional(),
    version,
  })
  .strict();

export const moveCardSchema = z
  .object({
    toColumnId: z.string().min(1),
    beforeId: optionalId,
    afterId: optionalId,
    version,
  })
  .strict();

export const moveColumnSchema = z
  .object({ beforeId: optionalId, afterId: optionalId, version })
  .strict();

export const moveBoardSchema = z
  .object({ beforeId: optionalId, afterId: optionalId, version })
  .strict();

export const deleteColumnSchema = z
  .object({ relocateToColumnId: z.string().min(1).optional() })
  .strict();
