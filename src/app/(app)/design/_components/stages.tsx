import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StageTracker } from "@/components/stage-tracker";
import { Stepper } from "@/components/stepper";

export function Stages() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Plan stage tracker</CardTitle>
          <CardDescription>Shown at the top of every plan. Replaces the red / orange / green text links in the old screens.</CardDescription>
        </CardHeader>
        <CardContent>
          <StageTracker
            stages={[
              { key: "initiated", label: "Initiated", state: "done" },
              { key: "proposed", label: "Proposed", state: "done", note: "4 of 4 components" },
              { key: "sourcing", label: "Force sourcing", state: "attention", note: "Short by 14" },
              { key: "placement", label: "Placement", state: "current", note: "1,240 of 1,310 placed" },
              { key: "published", label: "Published", state: "upcoming" },
              { key: "live", label: "Live", state: "upcoming" },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stepper</CardTitle>
          <CardDescription>Component Officer proposal, one step at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <Stepper
            current={2}
            steps={[
              { label: "Sectors", description: "Names, shifts, instructions" },
              { label: "Points", description: "Library or map, priority, intensity" },
              { label: "Ranks & teams", description: "Batches, merge" },
              { label: "Logistics", description: "Equipment quantities" },
              { label: "Preferences", description: "Unit, station or person" },
              { label: "Preview", description: "Check and submit" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
