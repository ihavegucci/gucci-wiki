"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

// Обёртка для лёгкой анимации перехода между страницами (R10) —
// переиспользуется и app/(app)/template.tsx, и app/(profile)/template.tsx
// (два разных route group с общим Sidebar/Topbar, у каждого свой template).
//
// Собственный `template.tsx` от Next.js для этого не подошёл: он получает
// новый key только при смене ПЕРВОГО сегмента пути и не пересоздаётся при
// смене вложенного — то есть между /spaces/a и /spaces/b, /admin/users и
// /admin/broadcast, /pages/x и /pages/y анимация не запускалась (нашёл
// пользователь после первого прогона). Здесь key — весь `pathname`
// целиком, поэтому React пересоздаёт `motion.div` при любой навигации.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
