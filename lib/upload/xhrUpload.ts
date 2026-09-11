// Единственное место в проекте, откуда браузер отправляет файл с показом
// прогресса. Почему XMLHttpRequest, а не fetch: fetch не сообщает прогресс
// ОТПРАВКИ тела вообще — `res.body` даёт только прогресс приёма ответа, а
// ReadableStream в качестве body требует HTTP/2 + duplex и всё равно не
// отдаёт счётчик отправленных байт. `xhr.upload.onprogress` — единственный
// способ, поддержанный всеми браузерами, поэтому здесь именно он, а не
// «устаревший API».

export type UploadProgress = {
  loaded: number;
  // null — длина неизвестна (`event.lengthComputable === false`): процент
  // считать не из чего, интерфейс обязан показать неопределённое состояние,
  // а не «0%», иначе полоса выглядит как зависшая на нуле загрузка.
  total: number | null;
};

// Отмена пользователем — не ошибка: вызывающий код должен просто убрать
// полосу, а не показывать красное сообщение. Отдельный класс, а не строка в
// `message`, чтобы отличать её от настоящей ошибки без сравнения текстов.
export class UploadAbortedError extends Error {
  constructor() {
    super("Загрузка отменена.");
    this.name = "UploadAbortedError";
  }
}

export type UploadHandle<T> = {
  promise: Promise<T>;
  abort: () => void;
};

export function xhrUpload<T>(
  url: string,
  body: FormData,
  onProgress?: (progress: UploadProgress) => void
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      onProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : null,
      });
    };

    xhr.onload = () => {
      // Свои роуты отвечают JSON и на успех, и на ошибку (`{error}`), но 413
      // может прийти и от nginx (HTML-страница) — парс обязан не падать,
      // иначе вместо причины пользователь получит исключение в консоли.
      let data: { error?: string; [key: string]: unknown } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }

      reject(
        new Error(
          data?.error ??
            (xhr.status === 413
              ? "Файл слишком большой."
              : `Сервер ответил ошибкой (${xhr.status}).`)
        )
      );
    };

    xhr.onerror = () => reject(new Error("Не удалось подключиться к серверу."));
    xhr.onabort = () => reject(new UploadAbortedError());

    xhr.send(body);
  });

  return { promise, abort: () => xhr.abort() };
}
