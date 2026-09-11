import Link from "next/link";
import { notFound } from "next/navigation";
import { Home, ChevronRight } from "lucide-react";
import { getRoadmap } from "@/lib/roadmaps/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import RoadmapHeader from "@/components/roadmaps/RoadmapHeader";
import RoadmapChain from "@/components/roadmaps/RoadmapChain";

// Детальная страница карты (кусок 5): горизонтальная цепочка этапов с
// ветками-исключениями, как на assets/Онбординг.jpg (без секции «Спросить
// ИИ» — в проекте сознательно нет ИИ). params — Promise (Next.js 15+), как
// в app/(app)/spaces/[slug]/page.tsx.
export default async function RoadmapDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [roadmap, user] = await Promise.all([getRoadmap(id), getCurrentUser()]);
  if (!roadmap) notFound();

  const userCanEdit = canEdit(user);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-1.5 text-sm text-neutral-400">
        <Link href="/" className="flex items-center gap-1.5 hover:text-neutral-600">
          <Home size={14} />
        </Link>
        <ChevronRight size={13} />
        <Link href="/roadmaps" className="hover:text-neutral-600">
          Карты
        </Link>
        <ChevronRight size={13} />
        <span className="text-neutral-600">{roadmap.title}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        {userCanEdit ? (
          <RoadmapHeader roadmap={roadmap} />
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{roadmap.title}</h1>
            {roadmap.description && <p className="mt-1 text-neutral-500">{roadmap.description}</p>}
          </div>
        )}
      </div>

      <RoadmapChain roadmapId={roadmap.id} stages={roadmap.stages} canEdit={userCanEdit} />
    </div>
  );
}
