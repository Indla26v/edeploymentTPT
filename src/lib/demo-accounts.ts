/**
 * Demo logins created by `pnpm db:seed` (development data only; the seed refuses production).
 * Shown on the login page only when SHOW_DEMO_ACCOUNTS=true.
 */
export const DEMO_PASSWORD = "Demo@12345";

export type DemoAccountSeed = {
  username: string;
  role: string;
  who: string;
};

export const DEMO_ACCOUNTS: DemoAccountSeed[] = [
  { username: "admin", role: "State Admin", who: "State administrator" },
  { username: "sp", role: "UO + IO", who: "Superintendent of Police, Demo District" },
  { username: "addlsp", role: "IO", who: "Additional SP, Demo District" },
  { username: "dsp1", role: "CO", who: "DSP, Demo District" },
  { username: "dsp2", role: "CO", who: "DSP, Demo District" },
  { username: "sho.town1", role: "OI", who: "SHO, Town I PS" },
  { username: "sho.town2", role: "OI", who: "SHO, Town II PS" },
  { username: "sho.rural", role: "OI", who: "SHO, Rural PS" },
  { username: "om", role: "Office Mgr", who: "SI, District Police Office" },
  { username: "staff1", role: "Employee", who: "HC, District Police Office" },
  { username: "pc1015", role: "Personnel", who: "PC, Town I PS" },
  { username: "dgp", role: "DGP", who: "Chief Office — inter-district requests" },
  { username: "sp.north", role: "UO", who: "SP, North Demo District" },
  { username: "sho.north1", role: "OI", who: "SHO, North Town PS" },
  { username: "comdt.apsp", role: "UO", who: "Commandant, APSP 1st Battalion" },
];
