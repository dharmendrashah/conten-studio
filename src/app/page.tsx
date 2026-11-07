import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Content Studio
            <Badge variant="secondary">setup</Badge>
          </CardTitle>
          <CardDescription>Next.js, shadcn/ui, Prisma and PostgreSQL are wired up. Phase 1 starts next.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Database health: GET /api/health</p>
        </CardContent>
      </Card>
    </main>
  );
}
