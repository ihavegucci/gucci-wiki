// Встроенный планировщик (пересчёт свежести + автобэкап БД) — только
// Node.js-рантайм. Next.js также строит edge-вариант этого файла; шаблон
// `if (process.env.NEXT_RUNTIME === "edge") {...} else {...}` — из
// документации Next.js ("Specifying the runtime" в instrumentation.md),
// он нужен, чтобы edge-сборка не пыталась протащить Node-специфичный код
// (dist-таймеры используют child_process/net через @smithy/node-http-handler
// в lib/storage/s3.ts, у которого нет edge-варианта — простой ранний
// `return` после проверки этого не предотвращал, Turbopack всё равно падал
// на edge-бандле).
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  // Именно require(), не import(): по документации Next.js это то, что не
  // даёт Turbopack протащить node-специфичный код в edge-бандл (см.
  // комментарий выше — с await import() edge-сборка падала).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./instrumentation-node");
}
