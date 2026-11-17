import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

/**
 * Pushes published content to the GEN API, which is what the website reads.
 *
 * Publishing (or saving an already published entry) sends the entry, unpublishing hides it
 * on the site, deleting removes it. Member data lives in the API only: registrations,
 * chapter membership and mentorships are never touched from here.
 *
 *   GEN_API_URL     where the API is reachable from the CMS, e.g. http://api:8000
 *   GEN_SYNC_TOKEN  the API's CMS_SYNC_TOKEN
 *
 * With either one missing nothing is sent and the CMS works on its own.
 */

type Doc = Record<string, any>;

const label = (value?: string) =>
  (value ?? '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const event = (doc: Doc, mediaUrl: (file?: Doc) => string | null) => ({
  title: doc.title,
  startsAt: doc.start_date ?? doc.held_at,
  capacity: doc.max_participants ?? null,
  location: doc.location ?? null,
  description: doc.description ?? null,
  onlineLink: doc.online_link ?? null,
  bannerUrl: mediaUrl(doc.banner),
  slug: doc.slug ?? null,
});

// Content type -> path under /cms on the API, and the body the API expects there.
const TYPES: Record<string, { path: string; body: (doc: Doc, mediaUrl: (file?: Doc) => string | null) => Doc }> = {
  // Chapters go first: a gathering can only be sent once its chapter is there.
  'api::chapter.chapter': {
    path: 'chapters',
    body: (doc, mediaUrl) => ({
      slug: doc.slug,
      country: doc.country,
      city: doc.city || doc.country,
      flag: doc.flag ?? '',
      name: doc.name,
      description: doc.description ?? null,
      region: doc.region ?? null,
      bannerUrl: mediaUrl(doc.banner),
      contactEmail: doc.contact_email ?? null,
      contactPhone: doc.contact_phone ?? null,
      socialLinks: (doc.social_links ?? []).map((link: Doc) => ({ platform: link.platform, url: link.url })),
    }),
  },
  'api::event.event': {
    path: 'events',
    body: (doc, mediaUrl) => ({
      ...event(doc, mediaUrl),
      eventType: label(doc.event_type),
      endsAt: doc.end_date ?? null,
      organizer: doc.organizer ?? null,
      speaker: doc.speaker ?? null,
    }),
  },
  'api::gathering.gathering': {
    path: 'gatherings',
    body: (doc, mediaUrl) => {
      if (!doc.chapter) {
        throw new Error('pilih chapter untuk gathering ini, dan pastikan chapter-nya sudah di-publish');
      }
      return { ...event(doc, mediaUrl), eventType: 'Gathering', chapterId: doc.chapter.documentId };
    },
  },
  'api::mentor.mentor': {
    path: 'mentors',
    body: (doc, mediaUrl) => ({
      name: doc.name,
      role: doc.role,
      tags: (doc.tags ?? []).map((tag: Doc) => tag.name).filter(Boolean),
      avatarUrl: mediaUrl(doc.avatar),
      // Only approved mentors are listed on the site.
      active: doc.approval === 'approved',
      accountEmail: doc.account_email || null,
      bio: doc.bio ?? null,
      company: doc.company ?? null,
      slug: doc.slug ?? null,
    }),
  },
};

export function registerGenSync(strapi: Core.Strapi) {
  const apiUrl = (process.env.GEN_API_URL ?? '').replace(/\/+$/, '');
  const token = process.env.GEN_SYNC_TOKEN ?? '';
  const enabled = Boolean(apiUrl && token);

  const mediaUrl = (file?: Doc) => {
    if (!file?.url) return null;
    // Local uploads are stored as /uploads/...; the site needs the full address.
    return file.url.startsWith('/') ? `${strapi.config.get('server.url', '')}${file.url}` : file.url;
  };

  const call = async (method: string, path: string, body?: Doc) => {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/cms/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new Error(`API GEN tidak bisa dihubungi (${(error as Error).message})`);
    }
    if (!response.ok) {
      const reply = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(reply?.message ?? `API GEN menjawab ${response.status}`);
    }
  };

  const push = async (uid: string, documentId: string) => {
    const doc = await strapi.documents(uid as any).findOne({ documentId, status: 'published', populate: '*' });
    // Nothing published under this id (a draft was saved): nothing for the site.
    if (doc) await call('PUT', `${TYPES[uid].path}/${documentId}`, TYPES[uid].body(doc, mediaUrl));
  };

  const refuse = (context: { action: string; uid: string }, documentId: string, error: unknown) => {
    const reason = (error as Error).message;
    strapi.log.error(`[gen-sync] ${context.action} ${context.uid} ${documentId}: ${reason}`);
    return new errors.ApplicationError(`Dibatalkan, website tidak bisa menerima perubahan ini: ${reason}.`);
  };

  // Either the CMS and the site both change or neither does: taking something down is sent
  // before the CMS does it, and a publish the site refuses is rolled back by the error.
  strapi.documents.use(async (context, next) => {
    if (!enabled || !(context.uid in TYPES)) return next();
    const params = context.params as Doc;
    const path = TYPES[context.uid].path;

    if ((context.action === 'unpublish' || context.action === 'delete') && params.documentId) {
      try {
        if (context.action === 'delete') await call('DELETE', `${path}/${params.documentId}`);
        else await call('POST', `${path}/${params.documentId}/unpublish`);
      } catch (error) {
        throw refuse(context, params.documentId, error);
      }
      return next();
    }

    const result: any = await next();
    const documentId: string | undefined = params.documentId ?? result?.documentId;
    const publishes =
      context.action === 'publish' ||
      ((context.action === 'create' || context.action === 'update') && params.status === 'published');
    if (publishes && documentId) {
      try {
        await push(context.uid, documentId);
      } catch (error) {
        throw refuse(context, documentId, error);
      }
    }
    return result;
  });

  /** Sends everything that is published, so the site catches up on whatever it missed. */
  const pushAll = async () => {
    if (!enabled) {
      strapi.log.warn('[gen-sync] GEN_API_URL / GEN_SYNC_TOKEN not set: content is not sent to the website');
      return;
    }
    let sent = 0;
    let failed = 0;
    for (const uid of Object.keys(TYPES)) {
      const docs = await strapi.documents(uid as any).findMany({ status: 'published', fields: ['documentId'] as any });
      for (const { documentId } of docs) {
        try {
          await push(uid, documentId);
          sent += 1;
        } catch (error) {
          failed += 1;
          strapi.log.error(`[gen-sync] ${uid} ${documentId}: ${(error as Error).message}`);
        }
      }
    }
    strapi.log.info(`[gen-sync] startup sync: ${sent} sent, ${failed} failed`);
  };

  return { pushAll };
}
