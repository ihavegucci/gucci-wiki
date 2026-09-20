import Link from "next/link";
import { Home, ChevronRight, Map } from "lucide-react";
import { listRoadmaps } from "@/lib/roadmaps/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import NewRoadmapForm from "@/components/roadmaps/NewRoadmapForm";

// Список карт процессов (кусок 5, R01/R01.2/R01.3): плитки с названием и
// описанием, ссылка на детальную страницу /roadmaps/[id]. Создание — только
// canEdit, чтение доступно любой залогиненной роли (страница сама решает
// видимость, listRoadmaps() без проверки роли — см. «Швы куска 2»).
export default async function RoadmapsPage() {
  const [roadmaps, user] = await Promise.all([listRoadmaps(), getCurrentUser()]);
  const userCanEdit = canEdit(user);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-1.5 text-sm text-neutral-400">
        <Link href="/" className="flex items-center gap-1.5 hover:text-neutral-600">
          <Home size={14} />
        </Link>
        <ChevronRight size={13} />
        <span className="text-neutral-600">Карты</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Карты процессов</h1>
          <p className="mt-1 text-neutral-500">
            Пошаговые карты для описания процессов — этапы, ответственные и ветки-исключения.
          </p>
        </div>
        {userCanEdit && <NewRoadmapForm />}
      </div>

      {roadmaps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          {userCanEdit
            ? "Карт пока нет — создайте первую кнопкой «Новая карта» выше."
            : "Карт пока нет. Как только редактор их добавит, они появятся здесь."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {roadmaps.map((roadmap) => (
            <Link
              key={roadmap.id}
              href={`/roadmaps/${roadmap.id}`}
              className="group flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
            >
              <Map size={18} className="mt-0.5 shrink-0 text-neutral-300" />
              <div className="min-w-0">
                <div className="truncate font-medium text-neutral-900">{roadmap.title}</div>
                {roadmap.description && (
                  <div className="mt-1 line-clamp-2 text-xs text-neutral-400">{roadmap.description}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
