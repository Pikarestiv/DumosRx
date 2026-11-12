import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GUIDES, getGuideBySlug } from "@/lib/guides-data";
import { GuideDetailView } from "@/components/guides/guide-detail-view";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return GUIDES.map((guide) => ({
    slug: guide.id,
  }));
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return {
      title: "Guide Not Found | DumosRx",
    };
  }

  return {
    title: `${guide.title} | DumosRx Guides`,
    description: guide.summary,
    openGraph: {
      title: `${guide.title} | DumosRx Guides & Video Tutorials`,
      description: guide.summary,
    },
  };
}

export default async function GuideDetailPage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    notFound();
  }

  const sameCategory = GUIDES.filter(
    (g) => g.id !== slug && g.category === guide.category,
  );
  const otherCategory = GUIDES.filter(
    (g) => g.id !== slug && g.category !== guide.category,
  );
  const relatedGuides = [...sameCategory, ...otherCategory].slice(0, 2);

  return <GuideDetailView guide={guide} relatedGuides={relatedGuides} />;
}

