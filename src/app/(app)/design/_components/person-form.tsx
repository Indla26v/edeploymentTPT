"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetBody, SheetClose, SheetFooter } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const personSchema = z.object({
  name: z.string().trim().min(3, "Enter the officer's full name"),
  rank: z.string().min(1, "Choose a rank"),
  station: z.string().min(1, "Choose a station"),
  genNo: z.string().trim().regex(/^\d{1,8}$/, "General number is digits only"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  gender: z.enum(["male", "female"]),
  dob: z.string().min(1, "Enter date of birth"),
  fitness: z.enum(["fit", "light_duty_only"]),
});

type PersonForm = z.infer<typeof personSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function PersonFormBody({ onDone }: { onDone?: () => void }) {
  const form = useForm<PersonForm>({
    resolver: zodResolver(personSchema),
    defaultValues: { name: "", rank: "", station: "", genNo: "", phone: "", gender: "male", dob: "", fitness: "fit" },
  });
  const { errors } = form.formState;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={form.handleSubmit((values) => {
        toast.success("Police person added", { description: `${values.name} · ${values.rank} · ${values.station}` });
        form.reset();
        onDone?.();
      })}
      noValidate
    >
      <SheetBody className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pf-name">Officer name</Label>
          <Input id="pf-name" aria-invalid={!!errors.name} {...form.register("name")} placeholder="e.g. Ravi Kumar Allam" />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Rank</Label>
            <Controller
              control={form.control}
              name="rank"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-invalid={!!errors.rank}>
                    <SelectValue placeholder="Select rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {["CI", "SI", "ASI", "HC", "PC", "HG", "RSI(AR)", "PC(AR)"].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.rank?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-gen">Gen No.</Label>
            <Input id="pf-gen" inputMode="numeric" aria-invalid={!!errors.genNo} {...form.register("genNo")} />
            <FieldError message={errors.genNo?.message} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Station / office</Label>
          <Controller
            control={form.control}
            name="station"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-invalid={!!errors.station}>
                  <SelectValue placeholder="Select station" />
                </SelectTrigger>
                <SelectContent>
                  {["Town I PS", "Town II PS", "Rural PS", "Harbour PS", "Traffic PS", "Women PS"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.station?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pf-phone">Mobile number</Label>
          <div className="flex gap-2">
            <span className="inline-flex h-10 items-center rounded-full bg-muted px-3.5 text-sm text-muted-foreground">+91</span>
            <Input id="pf-phone" inputMode="tel" aria-invalid={!!errors.phone} {...form.register("phone")} placeholder="98xxxxxxxx" />
          </div>
          <FieldError message={errors.phone?.message} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pf-dob">Date of birth</Label>
            <Input id="pf-dob" type="date" aria-invalid={!!errors.dob} {...form.register("dob")} />
            <FieldError message={errors.dob?.message} />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <ToggleGroup type="single" value={field.value} onValueChange={(v) => v && field.onChange(v)} className="h-10 w-full">
                  <ToggleGroupItem value="male" className="flex-1">
                    Male
                  </ToggleGroupItem>
                  <ToggleGroupItem value="female" className="flex-1">
                    Female
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Fitness</Label>
          <Controller
            control={form.control}
            name="fitness"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fit">Fit for all duties</SelectItem>
                  <SelectItem value="light_duty_only">Light duty only (never on high-intensity points)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pf-photo">Photo</Label>
          <Input id="pf-photo" type="file" accept="image/*" className="h-11 py-1.5" />
        </div>
      </SheetBody>
      <SheetFooter>
        <SheetClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </SheetClose>
        <Button type="submit">Save officer</Button>
      </SheetFooter>
    </form>
  );
}
