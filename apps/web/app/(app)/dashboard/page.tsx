import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";

export default function DashboardPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
      {/* Pipeline Section — spans 8 cols on desktop */}
      {/* TODO: Epic 3 Story 3.1 replaces with <PipelineDashboard /> */}
      <section className="lg:col-span-8">
        <Card>
          <CardHeader>
            <CardTitle>Rechnungs-Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Noch keine Rechnungen"
              description="Hier erscheinen deine Rechnungen, sobald du sie erfasst hast."
            />
          </CardContent>
        </Card>
      </section>

      {/* Right column — 4 cols on desktop */}
      <div className="flex flex-col gap-4 lg:col-span-4">
        {/* Weekly Value Section */}
        {/* TODO: Epic 3 Story 3.5 + Epic 8 Story 8.3 populate this */}
        <Card>
          <CardHeader>
            <CardTitle>Deine Woche auf einen Blick</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm text-muted-foreground">
              Zusammenfassung startet, sobald du deine ersten Rechnungen
              verarbeitet hast.
            </p>
          </CardContent>
        </Card>

        {/* Processing Stats Section */}
        {/* TODO: Epic 3 Story 3.1 */}
        <Card>
          <CardHeader>
            <CardTitle>Verarbeitungsstatistik</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Noch keine Statistik"
              description="Statistik wird verfügbar, sobald Rechnungen verarbeitet wurden."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
