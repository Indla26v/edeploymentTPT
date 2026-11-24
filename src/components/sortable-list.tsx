"use client";

import * as React from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

function Row({ id, label, sub, index }: { id: string; label: string; sub?: string; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-xl border border-border/70 bg-card px-2 py-1.5", isDragging && "z-10 shadow-lifted ring-2 ring-primary/30")}
    >
      <button type="button" className="cursor-grab touch-none rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label={`Move ${label}`} {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <span className="tabular w-6 text-right text-xs text-muted-foreground">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </li>
  );
}

/** Drag-to-reorder list (keyboard: space to pick up, arrows to move). */
export function SortableList({ id, items, onChange }: { id: string; items: { id: string; label: string; sub?: string }[]; onChange: (ids: string[]) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = items.map((i) => i.id);
    onChange(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-1.5">
          {items.map((it, i) => (
            <Row key={it.id} id={it.id} label={it.label} sub={it.sub} index={i} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
