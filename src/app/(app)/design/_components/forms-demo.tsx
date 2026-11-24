"use client";

import * as React from "react";
import { Send, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FilterPill, ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PersonFormBody } from "./person-form";

export function FormsDemo() {
  const [available, setAvailable] = React.useState(true);
  const [ranks, setRanks] = React.useState<string[]>(["HC", "PC"]);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Form controls</CardTitle>
          <CardDescription>Inputs are rounded-xl; choices are pills.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="demo-bb">Bandobast name</Label>
              <Input id="demo-bb" placeholder="e.g. Festival procession — Day 1" />
            </div>
            <div className="space-y-2">
              <Label>Component</Label>
              <Select defaultValue="lo-west">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lo-west">Law & Order — ACP West</SelectItem>
                  <SelectItem value="traffic">Traffic</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="crime">Crime</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-ins">Sector instructions</Label>
            <Textarea id="demo-ins" placeholder="Special instructions for officers in this sector…" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-center gap-3">
              <Switch id="demo-avail" checked={available} onCheckedChange={setAvailable} />
              <Label htmlFor="demo-avail">{available ? "Available for deployment" : "Not available"}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="demo-shift" defaultChecked />
              <Label htmlFor="demo-shift">Shift-wise duty</Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Point intensity</Label>
            <ToggleGroup type="single" defaultValue="high">
              <ToggleGroupItem value="high">High</ToggleGroupItem>
              <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
              <ToggleGroupItem value="low">Low</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>Filter by rank</Label>
            <div className="flex flex-wrap gap-2">
              {["SI", "ASI", "HC", "PC", "HG"].map((r) => (
                <FilterPill
                  key={r}
                  active={ranks.includes(r)}
                  onClick={() => setRanks((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))}
                >
                  {r}
                </FilterPill>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sheets, dialogs and toasts</CardTitle>
          <CardDescription>Add/edit opens a side sheet. Confirmation dialogs only for actions that cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2.5">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button>
                  <UserPlus /> Add police person
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Add police person</SheetTitle>
                  <SheetDescription>Age is calculated from date of birth, so it never goes stale.</SheetDescription>
                </SheetHeader>
                <PersonFormBody onDone={() => setSheetOpen(false)} />
              </SheetContent>
            </Sheet>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Send /> Send to stations
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send force request to 6 stations?</DialogTitle>
                  <DialogDescription>
                    Stations can commit fewer men than asked. Any gap shows on your ledger, where you can accept it or top up from other stations —
                    the plan never goes back to the Initiating Officer.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={() => toast.success("Force request sent", { description: "6 stations · deadline 18:30" })}>
                      <Send /> Yes, send
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" size="sm" onClick={() => toast.success("Saved", { description: "Sector 2.1 updated" })}>
              Success toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.error("Invalid swap", { description: "Only officers of the same rank can take this slot." })}>
              Error toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.info("Town II PS committed 2 of 10 HC", { description: "Reason: men on election duty" })}>
              Info toast
            </Button>
          </div>

          <Tabs defaultValue="ongoing">
            <TabsList>
              <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="other">Other unit</TabsTrigger>
            </TabsList>
            <TabsContent value="ongoing" className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              Pill tabs switch list views (Ongoing / Completed / Other unit requirement).
            </TabsContent>
            <TabsContent value="completed" className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              Completed plans keep their final duty allocation, scheme book and duty passes.
            </TabsContent>
            <TabsContent value="other" className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              Other-unit requirements arrive with the DGP flow in phase 2 of the roadmap.
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
