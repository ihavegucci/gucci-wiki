import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import Sidebar from "@/components/shell/Sidebar";
import MobileSidebar from "@/components/shell/MobileSidebar";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Настройки — только Admin (R05). Это подстраховка для рендера страницы;
  // реальная проверка — в каждом роуте app/settings/*/route.ts.
  if (user.role !== "ADMIN") redirect("/");

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <MobileSidebar sidebar={<Sidebar user={user} />} isAdmin>
        {children}
      </MobileSidebar>
    </div>
  );
}
