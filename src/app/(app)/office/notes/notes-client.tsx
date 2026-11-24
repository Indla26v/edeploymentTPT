"use client";

import * as React from "react";
import { Loader2, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteNoteAction, saveNoteAction } from "../actions";

type Color = "yellow" | "blue" | "green" | "pink" | "gray";
type Note = { id: string; title: string | null; body: string; color: Color; pinned: boolean; updatedAt: string };
const BG: Record<Color, string> = { yellow: "bg-[oklch(0.97_0.06_95)]", blue: "bg-[oklch(0.96_0.03_240)]", green: "bg-[oklch(0.96_0.05_155)]", pink: "bg-[oklch(0.96_0.035_350)]", gray: "bg-muted" };
const COLORS = Object.keys(BG) as Color[];

export function NotesClient({ notes }: { notes: Note[] }) {
  const [draft, setDraft] = React.useState({ title: "", body: "", color: "yellow" as Color });
  const [pending, start] = React.useTransition();
  const save = (id: string | null, n: { title: string | null; body: string; color: Color; pinned: boolean }) =>
    start(async () => {
      const r = await saveNoteAction(id, n);
      if (!r.ok) return void toast.error(r.error);
      if (!id) setDraft({ title: "", body: "", color: draft.color });
    });
  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex flex-col gap-2 rounded-2xl border p-3 shadow-soft sm:max-w-xl", BG[draft.color])}>
        <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (optional)" aria-label="Note title" className="border-transparent bg-white/60" />
        <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Take a note…" aria-label="Note" rows={3} className="border-transparent bg-white/60" />
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`${c} note`} aria-pressed={draft.color === c} onClick={() => setDraft({ ...draft, color: c })} className={cn("size-6 rounded-full border", BG[c], draft.color === c && "ring-2 ring-primary/50")} />
          ))}
          <Button size="sm" className="ml-auto" disabled={pending || !draft.body.trim()} onClick={() => save(null, { title: draft.title || null, body: draft.body, color: draft.color, pinned: false })}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add note
          </Button>
        </div>
      </div>
      <div className="columns-1 gap-3 sm:columns-2 xl:columns-4">
        {notes.map((n) => (
          <NoteCard key={n.id} n={n} onSave={(x) => save(n.id, x)} />
        ))}
      </div>
      {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
    </div>
  );
}

function NoteCard({ n, onSave }: { n: Note; onSave: (x: { title: string | null; body: string; color: Color; pinned: boolean }) => void }) {
  const [body, setBody] = React.useState(n.body);
  const [pending, start] = React.useTransition();
  return (
    <div className={cn("mb-3 break-inside-avoid rounded-2xl border p-3 shadow-soft", BG[n.color])}>
      <div className="flex items-start gap-1">
        <p className="flex-1 font-medium">{n.title}</p>
        <Button size="icon-sm" variant="ghost" aria-label={n.pinned ? "Unpin" : "Pin"} onClick={() => onSave({ title: n.title, body, color: n.color, pinned: !n.pinned })}>
          {n.pinned ? <PinOff /> : <Pin />}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete note"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteNoteAction(n.id);
              if (!r.ok) toast.error(r.error);
            })
          }
        >
          <Trash2 />
        </Button>
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => body !== n.body && body.trim() && onSave({ title: n.title, body, color: n.color, pinned: n.pinned })} aria-label="Edit note" rows={Math.min(10, Math.max(2, body.split("\n").length))} className="resize-none border-transparent bg-transparent px-0 shadow-none focus-visible:bg-white/60" />
      <p className="text-[11px] text-muted-foreground">{fmtRelative(n.updatedAt)}</p>
    </div>
  );
}
