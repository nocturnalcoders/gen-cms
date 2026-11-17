import type { Core } from '@strapi/strapi';

import { registerGenSync } from './gen-sync';

let genSync: ReturnType<typeof registerGenSync>;

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    genSync = registerGenSync(strapi);
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap() {
    // Not awaited: the CMS should come up even while the API is unreachable.
    genSync.pushAll().catch((error) => console.error(`[gen-sync] startup sync failed: ${error.message}`));
  },
};
