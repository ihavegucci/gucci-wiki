import PageTransition from "@/components/shell/PageTransition";

// Тот же каркас (Sidebar+Topbar), что у (app) и (profile), но /settings не
// входит ни в одну из этих route group — свой template.tsx для той же
// анимации, components/shell/PageTransition.tsx.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
