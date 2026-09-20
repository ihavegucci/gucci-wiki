import {
  Building2,
  Package,
  Megaphone,
  TrendingUp,
  Headphones,
  Users,
  Banknote,
  Server,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

// Ключ иконки хранится строкой в Space.icon — так проще заводить новые
// пространства в чунке 2, не трогая enum/тип в схеме.
const ICONS: Record<string, LucideIcon> = {
  "building-2": Building2,
  package: Package,
  megaphone: Megaphone,
  "trending-up": TrendingUp,
  headphones: Headphones,
  users: Users,
  banknote: Banknote,
  server: Server,
};

export function getSpaceIcon(icon: string | null | undefined): LucideIcon {
  return (icon && ICONS[icon]) || BookOpen;
}

// Ключи для формы создания пространства (чунк 2) — те же иконки, что и в списке выше.
export const SPACE_ICON_KEYS = Object.keys(ICONS);

const COLOR_CLASSES: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  blue: "bg-blue-50 text-blue-600",
  pink: "bg-pink-50 text-pink-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  teal: "bg-teal-50 text-teal-600",
  slate: "bg-slate-100 text-slate-600",
};

export function getSpaceColorClasses(color: string | null | undefined): string {
  return (color && COLOR_CLASSES[color]) || COLOR_CLASSES.slate;
}

export const SPACE_COLOR_KEYS = Object.keys(COLOR_CLASSES);
