"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PublicProvider } from "../repository";
import {
  addProviderAction,
  deleteProviderAction,
  loadProviderModelsAction,
  pollGithubSignInAction,
  setDefaultProviderAction,
  startGithubSignInAction,
  setProviderModelAction,
  testProviderAction,
  updateProviderAction,
  type ActionResult,
} from "../actions";
import { ModelDialog, type ModelPicker } from "./model-dialog";
import { toast } from "sonner";
import { providerKinds } from "../schema";
import { kindLabels } from "../labels";

type FormState = {
  label: string;
  kind: (typeof providerKinds)[number];
  apiKey: string;
};

function emptyForm(): FormState {
  return { label: "", kind: "openai", apiKey: "" };
}

function ConnectionBadge({ provider }: { provider: PublicProvider }) {
  if (provider.lastTestOk === null) return <Badge variant="outline">Untested</Badge>;
  return provider.lastTestOk ? <Badge>Connected</Badge> : <Badge variant="destructive">Failed</Badge>;
}

export function ProviderSettings({ providers }: { providers: PublicProvider[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PublicProvider | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<PublicProvider | null>(null);
  const [picker, setPicker] = useState<ModelPicker | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const signInRun = useRef(0);

  function cancelSignIn() {
    signInRun.current += 1;
    setSignIn(null);
  }

  async function pollSignIn(run: number, pendingToken: string, interval: number, label: string) {
    let wait = interval;
    while (run === signInRun.current) {
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      if (run !== signInRun.current) return;
      const result = await pollGithubSignInAction({ pendingToken, label });
      if (run !== signInRun.current) return;
      if (!result.ok) {
        setSignIn(null);
        setError(result.error);
        return;
      }
      if (result.status === "connected") {
        setSignIn(null);
        setOpen(false);
        toast.success(`${label} connected`);
        return;
      }
      wait = result.interval;
    }
  }

  function startSignIn() {
    const label = form.label.trim();
    signInRun.current += 1;
    const run = signInRun.current;
    startTransition(async () => {
      const started = await startGithubSignInAction();
      if (!started.ok) {
        setError(started.error);
        return;
      }
      if (run !== signInRun.current) return;
      setError(null);
      setSignIn({ userCode: started.userCode, verificationUri: started.verificationUri });
      await pollSignIn(run, started.pendingToken, started.interval, label);
    });
  }

  function openAdd() {
    cancelSignIn();
    setEditing(null);
    setForm(emptyForm());
    setShowKey(false);
    setError(null);
    setOpen(true);
  }

  function openEdit(provider: PublicProvider) {
    cancelSignIn();
    setEditing(provider);
    setForm({ label: provider.label, kind: provider.kind, apiKey: "" });
    setShowKey(false);
    setError(null);
    setOpen(true);
  }

  function finish(result: ActionResult) {
    if (result.ok) {
      setOpen(false);
    } else {
      setError(result.error);
    }
  }

  function submit() {
    if (form.kind === "github" && !editing) {
      startSignIn();
      return;
    }
    startTransition(async () => {
      if (editing) {
        finish(
          await updateProviderAction({
            id: editing.id,
            label: form.label,
            apiKey: form.apiKey || undefined,
          }),
        );
      } else {
        finish(await addProviderAction(form));
      }
    });
  }

  function runRowAction(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
    });
  }

  function openModel(provider: PublicProvider) {
    startTransition(async () => {
      const result = await loadProviderModelsAction(provider.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setModelError(null);
      setPicker({ provider, models: result.models, selected: provider.defaultModel ?? "" });
    });
  }

  function changeModel(model: string) {
    setPicker((current) => (current ? { ...current, selected: model } : current));
  }

  function saveModel() {
    if (!picker) return;
    const { provider, selected } = picker;
    startTransition(async () => {
      const result = await setProviderModelAction({ id: provider.id, model: selected });
      if (result.ok) {
        setPicker(null);
      } else {
        setModelError(result.error);
      }
    });
  }

  function closeModel() {
    setPicker(null);
    setModelError(null);
  }

  function testRow(provider: PublicProvider) {
    startTransition(async () => {
      const result = await testProviderAction(provider.id);
      if (result.ok) {
        toast.success(`${provider.label} connected`);
      } else {
        toast.error(`${provider.label}: ${result.error}`);
      }
    });
  }

  function requestRemove(provider: PublicProvider) {
    setError(null);
    setPendingDelete(provider);
  }

  function confirmRemove() {
    const target = pendingDelete;
    if (!target) return;
    startTransition(async () => {
      const result = await deleteProviderAction(target.id);
      setError(result.ok ? null : result.error);
      setPendingDelete(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Keys are encrypted at rest and never shown again after saving.
        </p>
        <Button onClick={openAdd}>Add provider</Button>
      </div>

      {error && !open ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {providers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No AI providers yet. Add one to start generating content.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.id}>
                <TableCell className="font-medium">{provider.label}</TableCell>
                <TableCell>{kindLabels[provider.kind]}</TableCell>
                <TableCell className="font-mono">
                  {provider.defaultModel ?? <span className="text-muted-foreground">Not set</span>}
                </TableCell>
                <TableCell className="font-mono">•••• {provider.keyLast4}</TableCell>
                <TableCell>
                  {provider.isDefault ? (
                    <Badge>Default</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => runRowAction(() => setDefaultProviderAction(provider.id))}
                    >
                      Set default
                    </Button>
                  )}
                </TableCell>
                <TableCell>
                  <ConnectionBadge provider={provider} />
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => openModel(provider)}>
                    Model
                  </Button>
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => testRow(provider)}>
                    Test
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(provider)}>
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending || (provider.isDefault && providers.length > 1)}
                    onClick={() => requestRemove(provider)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) cancelSignIn();
          setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit provider" : "Add provider"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Leave the API key blank to keep the saved key."
                : "Your API key is encrypted before it is stored."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider-label">Label</Label>
              <Input
                id="provider-label"
                value={form.label}
                placeholder="Work, Client A"
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="provider-kind">Provider</Label>
              <select
                id="provider-kind"
                className="h-9 rounded-md border bg-transparent px-3 text-sm disabled:opacity-50"
                value={form.kind}
                disabled={Boolean(editing)}
                onChange={(event) =>
                  setForm({ ...form, kind: event.target.value as FormState["kind"] })
                }
              >
                {providerKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabels[kind]}
                  </option>
                ))}
              </select>
            </div>

            {form.kind !== "github" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="provider-key">API key</Label>
              <div className="flex gap-2">
                <Input
                  id="provider-key"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  value={form.apiKey}
                  placeholder={editing ? `•••• ${editing.keyLast4} (unchanged)` : "Paste your key"}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  required={!editing}
                />
                <Button type="button" variant="outline" onClick={() => setShowKey((value) => !value)}>
                  {showKey ? "Hide" : "Show"}
                </Button>
              </div>
            </div>

            ) : null}

            {form.kind === "github" && !editing ? (
              <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                {signIn ? (
                  <>
                    <p>
                      Open{" "}
                      <a href={signIn.verificationUri} target="_blank" rel="noreferrer" className="underline">
                        {signIn.verificationUri}
                      </a>{" "}
                      and enter this code:
                    </p>
                    <p className="font-mono text-base font-semibold tracking-widest">{signIn.userCode}</p>
                    <p className="text-muted-foreground">Waiting for approval on GitHub...</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Sign in with the GitHub account that has a Copilot subscription.
                  </p>
                )}
              </div>
            ) : null}

            {form.kind === "github" && editing ? (
              <p className="text-sm text-muted-foreground">
                Signed in with GitHub. You can change the label here.
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={pending || signIn !== null}>
                {form.kind === "github" && !editing ? "Sign in with GitHub" : pending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ModelDialog
        picker={picker}
        pending={pending}
        error={modelError}
        onSelect={changeModel}
        onSave={saveModel}
        onClose={closeModel}
      />

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete provider?</DialogTitle>
            <DialogDescription>
              {`"${pendingDelete?.label ?? ""}" and its stored key will be removed. Default models that use it will be cleared. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={confirmRemove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
