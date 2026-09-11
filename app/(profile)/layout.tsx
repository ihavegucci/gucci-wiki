import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import Sidebar from "@/components/shell/Sidebar";
import MobileSidebar from "@/components/shell/MobileSidebar";

// Тот же каркас (Sidebar+Topbar), что и у /settings — профильные страницы
// не входят в app/(app), но выглядят как часть того же приложения.
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <MobileSidebar sidebar={<Sidebar user={user} />} isAdmin={user.role === "ADMIN"}>
        {children}
      </MobileSidebar>
    </div>
  );
}
