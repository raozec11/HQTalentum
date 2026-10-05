import { MetadataRoute } from 'next';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

export default async function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://cloud.talentumhq.com';
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
  ];

  try {
    // Fetch active talents across all companies
    const talentsQuery = query(collection(db, 'talents'), where('status', '!=', 'inactive'));
    const tSnap = await getDocs(talentsQuery);

    tSnap.docs.forEach((doc) => {
      const data = doc.data();
      const companyId = data.companyId || 'wild';
      const slug = (data.username || data.customUrl || data.displayName || data.name || doc.id)
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      if (slug) {
        routes.push({
          url: `${baseUrl}/${companyId.toLowerCase()}/talent/${slug}`,
          lastModified: data.updatedAt ? new Date(data.updatedAt) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.8,
        });
      }
    });
  } catch (error) {
    console.error('Error generating sitemap:', error);
  }

  return routes;
}
