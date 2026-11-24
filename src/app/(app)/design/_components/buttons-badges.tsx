import { CheckCheck, Download, Plus, Send, Sparkles, Trash2 } from "lucide-react";

import { StatusPill, STATUS_META, type Status } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ButtonsAndBadges() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button>
              <Plus /> Add new
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">
              <Download /> Export Excel
            </Button>
            <Button variant="soft">
              <Sparkles /> Suggest placement
            </Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="success">
              <CheckCheck /> Accept
            </Button>
            <Button variant="destructive">
              <Trash2 /> Delete
            </Button>
            <Button variant="link">Link style</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">
              <Send /> Publish plan
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="Add">
              <Plus />
            </Button>
            <Button size="icon" variant="outline" aria-label="Add">
              <Plus />
            </Button>
            <Button size="icon-lg" aria-label="Add">
              <Plus />
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_META) as Status[]).map((s) => (
              <StatusPill key={s} status={s} {...(s === "short" ? { count: 8 } : {})} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-5">
            <Badge tone="solid">SI</Badge>
            <Badge tone="primary">HC</Badge>
            <Badge tone="outline">PC</Badge>
            <Badge tone="info">General</Badge>
            <Badge tone="neutral">AR</Badge>
            <Badge tone="warning">APSP</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
