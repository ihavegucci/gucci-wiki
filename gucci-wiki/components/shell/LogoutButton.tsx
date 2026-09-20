"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Без проверки res.ok неудачный выход всё равно уводил на /login: сессия
  // на сервере оставалась живой, а пользователь считал, что вышел.
  async function handleLogout() {
    setError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        setError("Не удалось выйти. Попробуйте ещё раз.");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("Не удалось подключиться к серверу.");
    }
  }

  return (
    <>
      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        <LogOut size={15} />
        Выйти
      </button>
      {error && <p className="-mx-2 px-2 text-xs text-red-600">{error}</p>}
    </>
  );
}
