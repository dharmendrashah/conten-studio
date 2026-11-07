import { createProviderSchema, keyLast4, setUseCaseDefaultSchema, updateProviderSchema } from "./schema";

describe("createProviderSchema", () => {
  it("accepts a valid provider and trims the label", () => {
    const result = createProviderSchema.safeParse({
      label: "  Work  ",
      kind: "openai",
      apiKey: "sk-test-1234567890",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.label).toBe("Work");
  });

  it("rejects an empty label", () => {
    const result = createProviderSchema.safeParse({ label: "  ", kind: "openai", apiKey: "sk-test-1234567890" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown provider kind", () => {
    const result = createProviderSchema.safeParse({ label: "Work", kind: "mystery", apiKey: "sk-test-1234567890" });
    expect(result.success).toBe(false);
  });

  it("rejects a key that is too short", () => {
    const result = createProviderSchema.safeParse({ label: "Work", kind: "openai", apiKey: "short" });
    expect(result.success).toBe(false);
  });
});

describe("updateProviderSchema", () => {
  it("allows omitting the API key to keep the stored one", () => {
    const result = updateProviderSchema.safeParse({ id: "p1", label: "Work" });
    expect(result.success).toBe(true);
  });

  it("requires an id", () => {
    const result = updateProviderSchema.safeParse({ label: "Work" });
    expect(result.success).toBe(false);
  });
});

describe("keyLast4", () => {
  it("returns the last four characters of the key", () => {
    expect(keyLast4("sk-test-1234567890abcd")).toBe("abcd");
  });
});

describe("setUseCaseDefaultSchema", () => {
  it("accepts each use case with a provider and model", () => {
    for (const useCase of ["llm", "image", "video", "tts", "stt", "music", "research"]) {
      expect(setUseCaseDefaultSchema.safeParse({ useCase, providerId: "p1", model: "m" }).success).toBe(true);
    }
  });

  it("rejects an unknown use case", () => {
    expect(setUseCaseDefaultSchema.safeParse({ useCase: "podcast", providerId: "p1", model: "m" }).success).toBe(false);
  });

  it("rejects a blank model", () => {
    expect(setUseCaseDefaultSchema.safeParse({ useCase: "llm", providerId: "p1", model: "  " }).success).toBe(false);
  });
});
