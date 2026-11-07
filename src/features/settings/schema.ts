import { z } from "zod";

export const providerKinds = ["openai", "anthropic", "google", "openrouter", "github"] as const;

const labelSchema = z
  .string()
  .trim()
  .min(1, "Label is required")
  .max(40, "Label must be 40 characters or less");

const apiKeySchema = z
  .string()
  .trim()
  .min(8, "API key looks too short")
  .max(256, "API key is too long");

export const createProviderSchema = z.object({
  label: labelSchema,
  kind: z.enum(providerKinds),
  apiKey: apiKeySchema,
});

export const updateProviderSchema = z.object({
  id: z.string().min(1),
  label: labelSchema,
  apiKey: apiKeySchema.optional(),
});

export const providerIdSchema = z.string().min(1);

export const aiUseCases = ["llm", "image", "video", "tts", "stt", "music", "research"] as const;

export const setUseCaseDefaultSchema = z.object({
  useCase: z.enum(aiUseCases),
  providerId: z.string().min(1),
  model: z.string().trim().min(1, "Choose a model").max(120),
});

export const githubPollSchema = z.object({
  pendingToken: z.string().min(1),
  label: labelSchema,
});

export const setProviderModelSchema = z.object({
  id: z.string().min(1),
  model: z.string().trim().min(1, "Choose a model").max(120),
});

export function keyLast4(apiKey: string): string {
  return apiKey.slice(-4);
}
