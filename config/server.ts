import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Public address, e.g. https://cms.gen.example.com (used for links to uploaded files).
  url: env('PUBLIC_URL', ''),
  // Behind the gateway: trust its X-Forwarded-* headers, so HTTPS is detected and
  // the admin login cookie can be set.
  proxy: { koa: env.bool('BEHIND_PROXY', false) },
  app: {
    keys: env.array('APP_KEYS')!,
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});

export default config;
