"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { PublicProvider } from "../repository";

export type ModelPicker = {
  provider: PublicProvider;
  models: string[];
  selected: string;
};

type Props = {
  picker: ModelPicker | null;
  pending: boolean;
  error: string | null;
  onSelect: (model: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function ModelDialog({ picker, pending, error, onSelect, onSave, onClose }: Props) {
  return (
    <Dialog open={picker !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Default model</DialogTitle>
          <DialogDescription>
            {picker ? `Models available for ${picker.provider.label}.` : ""}
          </DialogDescription>
        </DialogHeader>

        {picker ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider-model">Model</Label>
              <select
                id="provider-model"
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={picker.selected}
                onChange={(event) => onSelect(event.target.value)}
              >
                <option value="">Select a model</option>
                {picker.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={pending || picker.selected === ""}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
