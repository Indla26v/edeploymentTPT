import type { PublicationEntry } from "../db/schema/placement";

export const CONFLICT = "The board changed while you were working — it has been refreshed. Please try again.";

/** Diff two publication snapshots per officer. */
export function diffSnapshots(prev: PublicationEntry[], next: PublicationEntry[]) {
  const before = new Map(prev.map((e) => [e.personId, e.slotId]));
  const after = new Map(next.map((e) => [e.personId, e.slotId]));
  const added: string[] = [];
  const moved: string[] = [];
  const removed: string[] = [];
  let unchanged = 0;
  for (const [person, slot] of after) {
    const was = before.get(person);
    if (!was) added.push(person);
    else if (was !== slot) moved.push(person);
    else unchanged++;
  }
  for (const person of before.keys()) if (!after.has(person)) removed.push(person);
  return { added, moved, removed, unchanged };
}

