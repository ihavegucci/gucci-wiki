import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import Sidebar from "@/components/shell/Sidebar";
import MobileSidebar from "@/components/shell/MobileSidebar";
import { canEdit } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // proxy.ts уже отсекает неавторизованных до рендера; это — подстраховка.
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <MobileSidebar sidebar={<Sidebar user={user} />} canCreate={canEdit(user)} isAdmin={user.role === "ADMIN"}>
        {children}
      </MobileSidebar>
    </div>
  );
}
