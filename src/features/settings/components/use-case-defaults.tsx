"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { loadProviderModelsAction, setUseCaseDefaultAction } from "../actions";
import { kindLabels } from "../labels";
import type { PublicProvider, UseCaseDefault } from "../repository";
import { aiUseCases } from "../schema";

type UseCase = (typeof aiUseCases)[number];

const useCases: { id: UseCase; title: string; hint: string }[] = [
  { id: "llm", title: "LLM", hint: "Scripts, ideas and captions" },
  { id: "image", title: "Image generation", hint: "Visuals and thumbnails" },
  { id: "video", title: "Video generation", hint: "Clips for each scene" },
  { id: "tts", title: "Text to speech", hint: "Voiceover narration" },
  { id: "stt", title: "Speech to text", hint: "Transcribing audio to text" },
  { id: "music", title: "Music generation", hint: "Background tracks and jingles" },
  { id: "research", title: "Research", hint: "Fact-finding and source gathering" },
];

const selectClass = "h-9 rounded-md border bg-transparent px-3 text-sm disabled:opacity-50";

type LoadedModels = { providerId: string; list: string[] };

function modelOptions(
  providerId: string,
  loaded: LoadedModels | null,
  current: UseCaseDefault | undefined,
): string[] {
  if (loaded?.providerId === providerId) return loaded.list;
  if (current?.providerId === providerId) return [current.model];
  return [];
}

type RowProps = {
  useCase: UseCase;
  title: string;
  hint: string;
  providers: PublicProvider[];
  current: UseCaseDefault | undefined;
};

function UseCaseRow({ useCase, title, hint, providers, current }: RowProps) {
  const [providerId, setProviderId] = useState(current?.providerId ?? "");
  const [model, setModel] = useState(current?.model ?? "");
  const [loaded, setLoaded] = useState<LoadedModels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = modelOptions(providerId, loaded, current);

  function changeProvider(next: string) {
    setProviderId(next);
    setModel("");
    setLoaded(null);
    setError(null);
    if (!next) return;
    startTransition(async () => {
      const result = await loadProviderModelsAction(next);
      if (result.ok) {
        setLoaded({ providerId: next, list: result.models });
      } else {
        setError(result.error);
      }
    });
  }

  function save() {
    startTransition(async () => {
      const result = await setUseCaseDefaultAction({ useCase, providerId, model });
      if (result.ok) {
        setError(null);
        toast.success(`${title} default saved`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${useCase}-provider`}>Provider</Label>
            <select
              id={`${useCase}-provider`}
              className={selectClass}
              value={providerId}
              disabled={pending}
              onChange={(event) => changeProvider(event.target.value)}
            >
              <option value="">Select a provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {`${provider.label} (${kindLabels[provider.kind]})`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${useCase}-model`}>Model</Label>
            <select
              id={`${useCase}-model`}
              className={`${selectClass} font-mono`}
              value={model}
              disabled={pending || !providerId}
              onChange={(event) => setModel(event.target.value)}
            >
              <option value="">{pending ? "Loading models..." : "Select a model"}</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={save} disabled={pending || !providerId || !model}>
            Save
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function UseCaseDefaults({
  providers,
  defaults,
}: {
  providers: PublicProvider[];
  defaults: UseCaseDefault[];
}) {
  if (providers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Add a provider to choose default models for each use case.
      </p>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {useCases.map((useCase) => {
        const current = defaults.find((item) => item.useCase === useCase.id);
        return (
          <UseCaseRow
            key={`${useCase.id}-${current?.providerId ?? "none"}-${current?.model ?? ""}`}
            useCase={useCase.id}
            title={useCase.title}
            hint={useCase.hint}
            providers={providers}
            current={current}
          />
        );
      })}
    </div>
  );
}
