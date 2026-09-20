import { NextResponse } from "next/server";
import { attachmentHeader } from "@/lib/storage/contentDisposition";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

// «Скачать всё» одним архивом (правка пользователя после первого прогона):
// последовательные клики по /api/files/download/[fileId] не работали —
// браузер разрешает только первое скачивание, инициированное настоящим
// пользовательским жестом, а остальные (запущенные из setTimeout/цикла)
// тихо блокирует как множественные автоматические загрузки. Один архив —
// одно реальное скачивание, проблема снята полностью, а не подавлена.
const MAX_ZIP_FILES = 200;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Нужно войти." }, { status: 401 });
  }

  const url = new URL(request.url);
  const ids = url.searchParams.getAll("id").filter(Boolean);
  const zipName = url.searchParams.get("name")?.trim() || "files";
  if (ids.length === 0) {
    return NextResponse.json({ error: "Нечего скачивать." }, { status: 400 });
  }
  // Потолок на число файлов в архиве: список id приходит от клиента и
  // ничем не был ограничен, а каждый файл сервер тянет из бакета через
  // себя. Запрос с тысячей id, у которого клиент сразу рвёт соединение,
  // заставлял сервер продолжать качать всё это в никуда — несколько таких
  // запросов забивали исходящий канал и пул сокетов.
  if (ids.length > MAX_ZIP_FILES) {
    return NextResponse.json(
      { error: `За раз можно скачать не больше ${MAX_ZIP_FILES} файлов.` },
      { status: 400 }
    );
  }

  const files = await prisma.fileItem.findMany({ where: { id: { in: ids } } });
  if (files.length === 0) {
    return NextResponse.json({ error: "Файлы не найдены." }, { status: 404 });
  }

  const archive = new ZipArchive({ zlib: { level: 6 } });
  // Имена внутри архива не обязаны быть уникальными для zip-формата, но
  // одинаковые имена сбивают с толку при распаковке — добавляем суффикс
  // при повторе.
  const usedNames = new Set<string>();
  function uniqueName(name: string): string {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let i = 2;
    let candidate = `${base} (${i})${ext}`;
    while (usedNames.has(candidate)) {
      i += 1;
      candidate = `${base} (${i})${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  }

  // Добавляем файлы в архив по очереди — параллельные fetch к S3 внутри
  // одного архива всё равно пишутся в поток последовательно (archiver сам
  // это сериализует), поэтому нет смысла запускать их одновременно.
  //
  // Ошибка чтения ОДНОГО файла (S3 недоступен, объект удалён, таймаут) не
  // должна ронять архив целиком — раньше необработанное исключение из
  // fetch внутри цикла улетало в общий catch и вызывало archive.abort(),
  // выбрасывая уже собранные файлы вместе с проблемным. Теперь такой файл
  // просто пропускается (с логом), остальные всё равно попадают в архив.
  (async () => {
    try {
      for (const file of files) {
        try {
          const upstream = await fetch(file.url, { signal: AbortSignal.timeout(15_000) });
          if (upstream.ok && upstream.body) {
            archive.append(Readable.fromWeb(upstream.body as import("stream/web").ReadableStream), {
              name: uniqueName(file.name),
            });
          } else {
            console.error(`Файл пропущен в ZIP (${file.name}): S3 ответил ${upstream.status}`);
          }
        } catch (err) {
          console.error(`Файл пропущен в ZIP (${file.name}):`, err);
        }
      }
    } finally {
      await archive.finalize();
    }
  })().catch((err) => {
    console.error("Сборка ZIP-архива прервана:", err);
    archive.abort();
  });

  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachmentHeader(`${zipName}.zip`),
    },
  });
}

