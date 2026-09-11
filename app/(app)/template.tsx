import PageTransition from "@/components/shell/PageTransition";

// Логика анимации — в components/shell/PageTransition.tsx (usePathname,
// не встроенный механизм template.tsx — см. комментарий там).
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
