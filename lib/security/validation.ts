import { z } from "zod";

export const incidentIdSchema = z.string().min(1).max(64);
