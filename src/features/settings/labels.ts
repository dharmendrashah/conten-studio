import { providerKinds } from "./schema";

export const kindLabels: Record<(typeof providerKinds)[number], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  openrouter: "OpenRouter",
  github: "GitHub Copilot",
};
