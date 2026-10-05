import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/api/',
        '/master/',
        '/*/dashboard/',
      ],
    },
    sitemap: 'https://cloud.talentumhq.com/sitemap.xml',
  };
}
