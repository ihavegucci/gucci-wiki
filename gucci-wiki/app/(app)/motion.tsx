"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Точечные анимации главной страницы (кусок 8, G07): появление контента при
// загрузке и лёгкий "приподъём" карточки при наведении. Тонкие клиентские
// обёртки — вся разметка и данные внутри children остаются серверным рендером.
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ scale: 1.02 }} transition={{ duration: 0.15, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
