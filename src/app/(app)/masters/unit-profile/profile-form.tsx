"use client";

import * as React from "react";
import { Loader2, Save, Shield } from "lucide-react";
import { toast } from "sonner";

import { EntityFields, toFormData, type FormValues } from "@/components/masters/entity-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveUnitProfileAction } from "./actions";
import { unitProfileFields } from "./fields";

type Profile = {
  name: string;
  code: string;
  officerName: string | null;
  officerDesignation: string | null;
  officerPhone: string | null;
  about: string | null;
  logoUrl: string | null;
  signatureUrl: string | null;
  profileImageUrl: string | null;
};

export function UnitProfileForm({ profile, canManage }: { profile: Profile; canManage: boolean }) {
  const [values, setValues] = React.useState<FormValues>({
    officerName: profile.officerName ?? "",
    officerDesignation: profile.officerDesignation ?? "",
    officerPhone: profile.officerPhone ?? "",
    about: profile.about ?? "",
    logoUrl: profile.logoUrl,
    signatureUrl: profile.signatureUrl,
    profileImageUrl: profile.profileImageUrl,
  });
  const [files, setFiles] = React.useState<Record<string, File | "__remove__" | undefined>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();
  const img = (k: "logoUrl" | "signatureUrl") => {
    const f = files[k];
    return f instanceof File ? URL.createObjectURL(f) : f === "__remove__" ? null : (values[k] as string | null);
  };
  const logo = img("logoUrl");
  const sig = img("signatureUrl");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>Unit details</CardTitle>
          <CardDescription>Used on ID cards, duty passes and the scheme book.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canManage} className="contents">
            <EntityFields
              fields={unitProfileFields}
              values={values}
              onChange={(n, v) => setValues((c) => ({ ...c, [n]: v }))}
              errors={errors}
              options={{ stations: [], ranks: [] }}
              files={files}
              onFile={(n, f) => setFiles((c) => ({ ...c, [n]: f }))}
            />
          </fieldset>
          {canManage && (
            <div className="mt-4 flex justify-end">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveUnitProfileAction(toFormData(unitProfileFields, values, files));
                    if (!r.ok) {
                      setErrors(r.fieldErrors ?? {});
                      toast.error(r.error);
                      return;
                    }
                    setErrors({});
                    setFiles({});
                    toast.success(r.message ?? "Saved");
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Save />} Save profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Print preview</CardTitle>
          <CardDescription>How the header and signature appear on ID cards.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border shadow-soft">
            <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/95">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded image preview
                  <img src={logo} alt="Unit logo" className="h-full w-full object-contain" />
                ) : (
                  <Shield className="size-5 text-primary" aria-hidden />
                )}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">{profile.name}</p>
                <p className="text-[11px] opacity-80">Bandobast duty · ID card</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-3 px-4 py-4">
              <div className="space-y-1.5">
                <div className="h-2 w-28 rounded-full bg-muted" />
                <div className="h-2 w-20 rounded-full bg-muted" />
                <div className="h-2 w-24 rounded-full bg-muted" />
              </div>
              <div className="text-center">
                <div className="flex h-10 w-28 items-end justify-center">
                  {sig ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded image preview
                    <img src={sig} alt="Signature" className="max-h-10 object-contain" />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No signature</span>
                  )}
                </div>
                <p className="border-t pt-0.5 text-[10px] leading-tight text-muted-foreground">
                  {String(values.officerName || "Unit Officer")}
                  <br />
                  {String(values.officerDesignation || "")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
