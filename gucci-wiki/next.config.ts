import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Базовые security-заголовки (найдено слепой приёмкой QA-прогона
  // 2026-09-05 — отсутствовали вовсе). CSP сознательно не добавлен здесь:
  // корректный список источников для Tiptap/S3-картинок/inline-стилей
  // Tailwind требует отдельной проверки, чтобы не сломать редактор статей —
  // не тот риск, чтобы вносить его без явного тестирования.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
