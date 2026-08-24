import { z } from "zod";

export const incidentIdSchema = z.string().min(1).max(64);

export const feedbackRequestSchema = z.object({
  incidentId: incidentIdSchema.nullable().optional().default(null),
  message: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).nullable().optional().default(null),
});

export const authCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

// Login intentionally doesn't reuse authCredentialsSchema's min(8): a
// wrong/short password at login time should surface as the provider's
// "Invalid login credentials" (401), not a validation error (400) --
// enforcing password-strength policy belongs to signup only.
export const authLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
