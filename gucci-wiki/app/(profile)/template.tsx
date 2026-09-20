import PageTransition from "@/components/shell/PageTransition";

// (profile) — отдельный route group от (app) (см. app/(profile)/layout.tsx),
// поэтому у него свой template.tsx; логика та же — components/shell/PageTransition.tsx.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
