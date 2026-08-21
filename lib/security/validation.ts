import { z } from "zod";

export const incidentIdSchema = z.string().min(1).max(64);

export const feedbackRequestSchema = z.object({
  incidentId: incidentIdSchema.nullable().optional().default(null),
  message: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).nullable().optional().default(null),
});

