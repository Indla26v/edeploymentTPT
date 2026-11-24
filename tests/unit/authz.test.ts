import { describe, expect, it } from "vitest";

import { generateTempPassword, passwordProblem, usernameForOfficer } from "@/lib/auth/passwords";
import { USERNAME_PATTERN } from "@/lib/auth/config";
import { assignableRoles, scopeKindFor } from "@/lib/authz/assignable";
import { scopeStationIds, scopeUnitIds } from "@/lib/authz/authorize";
import { PERMISSIONS } from "@/lib/authz/permissions";
import type { Role } from "@/lib/authz/roles";

const asg = (role: Role, unitId: string | null, stationId: string | null = null) => ({
  id: crypto.randomUUID(),
  role,
  unitId,
  stationId,
  planId: null,
  planComponentId: null,
  departmentId: null,
});

describe("scope rules", () => {
  it("state-level roles see every unit", () => {
    expect(scopeUnitIds({ activeRole: "SUPER_ADMIN", assignments: [asg("SUPER_ADMIN", null)], unitId: null })).toBeNull();
    expect(scopeUnitIds({ activeRole: "DGP", assignments: [asg("DGP", null)], unitId: null })).toBeNull();
  });

  it("a Unit Officer is limited to their unit(s)", () => {
    expect(scopeUnitIds({ activeRole: "UNIT_OFFICER", assignments: [asg("UNIT_OFFICER", "u1")], unitId: "u1" })).toEqual(["u1"]);
  });

  it("an Office Incharge is limited to their station", () => {
    const user = { activeRole: "OFFICE_INCHARGE" as Role, assignments: [asg("OFFICE_INCHARGE", "u1", "s7")], unitId: "u1" };
    expect(scopeStationIds(user)).toEqual(["s7"]);
    expect(scopeUnitIds(user)).toEqual(["u1"]);
  });

  it("other roles are not station-limited", () => {
    expect(scopeStationIds({ activeRole: "UNIT_OFFICER", assignments: [asg("UNIT_OFFICER", "u1")] })).toBeNull();
  });

  it("a Unit Officer cannot create state-level accounts or other Unit Officers", () => {
    const granted = assignableRoles("UNIT_OFFICER");
    expect(granted).not.toContain("SUPER_ADMIN");
    expect(granted).not.toContain("DGP");
    expect(granted).not.toContain("UNIT_OFFICER");
    expect(granted).toContain("OFFICE_INCHARGE");
    expect(assignableRoles("OFFICE_INCHARGE")).toEqual([]);
  });

  it("Office Incharge assignments are station-scoped", () => {
    expect(scopeKindFor("OFFICE_INCHARGE")).toBe("station");
    expect(scopeKindFor("SUPER_ADMIN")).toBe("state");
    expect(scopeKindFor("COMPONENT_OFFICER")).toBe("unit");
  });
});

describe("default permission grants", () => {
  const grants = (key: string) => PERMISSIONS.find((p) => p.key === key)!.roles as readonly Role[];
  it("only the Unit Officer distributes force and accepts shortfalls", () => {
    expect(grants("force.distribute")).toEqual(["UNIT_OFFICER"]);
    expect(grants("force.accept_shortfall")).toEqual(["UNIT_OFFICER"]);
  });
  it("only the Initiating Officer can override placement across components and publish", () => {
    expect(grants("placement.override")).toEqual(["INITIATING_OFFICER"]);
    expect(grants("plans.publish")).toEqual(["INITIATING_OFFICER"]);
  });
  it("permission keys are unique", () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("passwords and usernames", () => {
  it("enforces the password policy", () => {
    expect(passwordProblem("short")).toMatch(/10 characters/);
    expect(passwordProblem("alllowercase1!")).toMatch(/uppercase/);
    expect(passwordProblem("NoDigitsHere!")).toMatch(/number/);
    expect(passwordProblem("NoSymbols123")).toMatch(/symbol/);
    expect(passwordProblem("Demo@12345")).toBeNull();
  });
  it("generates temporary passwords that satisfy the policy", () => {
    for (let i = 0; i < 50; i++) expect(passwordProblem(generateTempPassword())).toBeNull();
  });
  it("derives officer usernames from unit code and Gen No", () => {
    expect(usernameForOfficer("DEMO-DIST", "1281")).toBe("demo-1281");
    expect(USERNAME_PATTERN.test("demo-1281")).toBe(true);
    expect(USERNAME_PATTERN.test("sp")).toBe(true);
    expect(USERNAME_PATTERN.test("Bad Name")).toBe(false);
  });
});
