import { z } from "zod";

const runFormat = z.enum(["5v5_full_court", "3v3_half_court"]);
const city = z.enum(["SF", "OAK"]);
const visibility = z.enum(["public", "private"]);

export const createRunSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM"),
  timezone: z.string().min(1),
  format: runFormat,
  venue_name: z.string().min(1),
  exact_address: z.string().min(1),
  city,
  capacity: z.number().int().positive().nullable(),
  visibility,
  auto_approve: z.boolean(),
  publish: z.boolean(),
});

export const updateRunSchema = createRunSchema.partial();

export const createJoinRequestSchema = z.object({
  message: z.string().optional(),
});

export const declineJoinRequestSchema = z.object({
  decline_reason: z.string().optional(),
});
