import { test as setup } from "@playwright/test";

import { authFile, signIn } from "./helpers";

for (const user of ["sp", "admin", "sho.town1", "addlsp", "dsp1"]) {
  setup(`sign in as ${user}`, async ({ page }) => {
    await signIn(page, user);
    await page.context().storageState({ path: authFile(user) });
  });
}
