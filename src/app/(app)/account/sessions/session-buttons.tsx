"use client";

import * as React from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { revokeOtherSessionsAction, revokeSessionAction } from "../actions";

export function RevokeButton({ token }: { token: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => revokeSessionAction(token))}>
      <LogOut /> Sign out
    </Button>
  );
}

export function RevokeOthersButton() {
  const [pending, start] = React.useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => revokeOtherSessionsAction())}>
      <LogOut /> Sign out other devices
    </Button>
  );
}
