"use client";

import * as React from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActionResult } from "@/lib/server/mutate";

export type ImportResult = { total: number; valid: number; created: number; updated: number; errors: { row: number; message: string }[] };

/** Two-step Excel import: check (preview with row errors) → import valid rows. */
export function ImportSheet({
  open,
  onOpenChange,
  title,
  templateHref,
  action,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  templateHref: string;
  action: (fd: FormData) => Promise<ActionResult<ImportResult>>;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ImportResult | null>(null);
  const [pending, start] = React.useTransition();

  const run = (commit: boolean) =>
    start(async () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("commit", String(commit));
      const r = await action(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (commit) {
        toast.success(`Imported: ${r.data.created} new, ${r.data.updated} updated`, { description: r.data.errors.length ? `${r.data.errors.length} rows skipped` : undefined });
        onOpenChange(false);
        setFile(null);
        setPreview(null);
      } else setPreview(r.data);
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setFile(null);
          setPreview(null);
        }
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Fill the template, upload it, check the preview, then import. Nothing is saved until you press Import.</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <Button variant="outline" size="sm" asChild>
            <a href={templateHref} download>
              <Download /> Download template
            </a>
          </Button>
          <div className="space-y-1.5">
            <Input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="h-11 py-2"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
            <p className="text-xs text-muted-foreground">Excel .xlsx, up to 5 MB / 5,000 rows.</p>
          </div>
          {preview && (
            <div className="space-y-3 rounded-2xl border border-border/70 p-4">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="size-4 text-primary" aria-hidden />
                <span>
                  <span className="tabular font-semibold">{preview.valid}</span> of <span className="tabular">{preview.total}</span> rows are ready to import
                </span>
              </div>
              {preview.errors.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-warning-soft-foreground">
                    <TriangleAlert className="size-4" /> {preview.errors.length} rows will be skipped
                  </p>
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-muted/60 p-2 text-xs">
                    {preview.errors.map((e) => (
                      <li key={e.row}>
                        <span className="font-medium">Row {e.row}:</span> {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-success-soft-foreground">
                  <CheckCircle2 className="size-4" /> Every row looks good
                </p>
              )}
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!preview ? (
            <Button disabled={!file || pending} onClick={() => run(false)}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Check file
            </Button>
          ) : (
            <Button disabled={pending || preview.valid === 0} onClick={() => run(true)}>
              {pending ? <Loader2 className="animate-spin" /> : <Upload />} Import {preview.valid} rows
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
