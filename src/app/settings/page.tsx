import { Suspense } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { ProviderSettings } from "@/features/settings/components/provider-settings";
import { UseCaseDefaults } from "@/features/settings/components/use-case-defaults";
import { listProviders, listUseCaseDefaults } from "@/features/settings/repository";
import { db } from "@/lib/db";

async function ProviderSection() {
  const providers = await listProviders(db);
  return <ProviderSettings providers={providers} />;
}

async function UseCaseSection() {
  const [providers, defaults] = await Promise.all([listProviders(db), listUseCaseDefaults(db)]);
  return <UseCaseDefaults providers={providers} defaults={defaults} />;
}

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 px-4 py-4 md:py-6 lg:px-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-medium">AI providers</h2>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading providers...</p>}>
            <ProviderSection />
          </Suspense>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-medium">Default models</h2>
          <p className="text-sm text-muted-foreground">
            Each use case runs on its own provider and model.
          </p>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading defaults...</p>}>
            <UseCaseSection />
          </Suspense>
        </section>
      </div>
    </DashboardShell>
  );
}
