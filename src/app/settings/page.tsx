import { Suspense } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { ProviderSettings } from "@/features/settings/components/provider-settings";
import { listProviders } from "@/features/settings/repository";
import { db } from "@/lib/db";

async function ProviderSection() {
  const providers = await listProviders(db);
  return <ProviderSettings providers={providers} />;
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
      </div>
    </DashboardShell>
  );
}
