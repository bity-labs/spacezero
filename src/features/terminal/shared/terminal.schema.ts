import { z } from 'zod'

export const TERMINAL_DEFAULT_COLS = 80
export const TERMINAL_DEFAULT_ROWS = 24
export const TERMINAL_MIN_COLS = 2
export const TERMINAL_MAX_COLS = 500
export const TERMINAL_MIN_ROWS = 1
export const TERMINAL_MAX_ROWS = 300

const terminalContextSchema = z
  .object({
    kind: z.literal('project-session'),
    sessionId: z.string().trim().min(1).max(256)
  })
  .strict()

const terminalIdSchema = z.string().trim().min(1).max(256)

const terminalDimensionSchema = (min: number, max: number) => z.number().int().min(min).max(max)

export const terminalCreateRequestSchema = z
  .object({
    context: terminalContextSchema,
    cols: terminalDimensionSchema(TERMINAL_MIN_COLS, TERMINAL_MAX_COLS)
      .optional()
      .default(TERMINAL_DEFAULT_COLS),
    rows: terminalDimensionSchema(TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS)
      .optional()
      .default(TERMINAL_DEFAULT_ROWS)
  })
  .strict()

export const terminalSubscribeRequestSchema = z
  .object({
    terminalId: terminalIdSchema,
    context: terminalContextSchema,
    afterSequence: z.number().int().nonnegative().optional()
  })
  .strict()

export const terminalUnsubscribeRequestSchema = z
  .object({
    terminalId: terminalIdSchema,
    context: terminalContextSchema
  })
  .strict()

export const terminalWriteInputRequestSchema = z
  .object({
    terminalId: terminalIdSchema,
    context: terminalContextSchema,
    data: z
      .string()
      .min(1)
      .max(64 * 1024)
  })
  .strict()

export const terminalResizeRequestSchema = z
  .object({
    terminalId: terminalIdSchema,
    context: terminalContextSchema,
    cols: terminalDimensionSchema(TERMINAL_MIN_COLS, TERMINAL_MAX_COLS),
    rows: terminalDimensionSchema(TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS)
  })
  .strict()

export const terminalCloseRequestSchema = z
  .object({
    terminalId: terminalIdSchema,
    context: terminalContextSchema
  })
  .strict()
