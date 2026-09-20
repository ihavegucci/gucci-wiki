"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import EditorToolbar from "@/components/editor/EditorToolbar";
import ResizableImageView from "@/components/editor/ResizableImageView";
import { updatePageAction, type UpdatePageState } from "@/lib/pages/actions";
import "@/components/editor/tiptap.css";

// Расширяем стандартный Image атрибутами width/height (сохраняются прямо в
// HTML статьи) и своим NodeView с ручкой ресайза (кусок 6, R07).
const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

type Heading = { id: string; level: number; text: string };

export default function ArticleWorkspace({
  pageId,
  initialTitle,
  initialContent,
  initialUpdatedAt,
  canEdit,
}: {
  pageId: string;
  initialTitle: string;
  initialContent: string;
  initialUpdatedAt: string;
  canEdit: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const contentInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<UpdatePageState, FormData>(updatePageAction, null);

  // Метка версии, которую редактор держит в руках. Хранится в ref, а не в
  // состоянии: перерисовка от неё не нужна, а после каждого удачного
  // сохранения сервер присылает новую — без этого второе сохранение подряд
  // из той же вкладки конфликтовало бы само с собой.
  const baseUpdatedAtRef = useRef(initialUpdatedAt);
  const baseInputRef = useRef<HTMLInputElement>(null);
  // Ref, а не setState в эффекте: правило react-hooks/set-state-in-effect у
  // проекта включено как ошибка, да и лишний рендер здесь ни к чему.
  useEffect(() => {
    if (state?.ok) baseUpdatedAtRef.current = state.updatedAt;
  }, [state]);

  // Перезапись после показанного конфликта: пустая метка на сервере означает
  // «сохранить поверх». Затираемое содержимое всё равно уходит в историю,
  // поэтому действие обратимо.
  //
  // Флаг одноразовый и гасится в handleSubmit. Если вместо него просто
  // оставить в скрытом поле пустую строку, она там и останется — и КАЖДОЕ
  // следующее сохранение из этой вкладки молча станет перезаписью, то есть
  // защита выключится навсегда после первого же конфликта.
  const forceNextSaveRef = useRef(false);

  function handleForceSave() {
    forceNextSaveRef.current = true;
    formRef.current?.requestSubmit();
  }

  // TOC строится прямо из DOM редактора: у Tiptap нет своей нумерации
  // заголовков, поэтому проставляем id самим и переиспользуем их для
  // прокрутки по клику — обновляется на каждое изменение содержимого.
  const syncHeadings = useCallback((dom: HTMLElement) => {
    const nodes = Array.from(dom.querySelectorAll("h1, h2, h3"));
    setHeadings(
      nodes
        .map((el, i) => {
          const id = `heading-${i}`;
          el.id = id;
          return { id, level: Number(el.tagName[1]), text: el.textContent?.trim() ?? "" };
        })
        .filter((h) => h.text.length > 0)
    );
  }, []);

  const editor = useEditor({
    editable: canEdit,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      ResizableImage,
      Placeholder.configure({ placeholder: "Начните писать статью…" }),
    ],
    content: initialContent,
    onCreate: ({ editor }) => syncHeadings(editor.view.dom as HTMLElement),
    onUpdate: ({ editor }) => syncHeadings(editor.view.dom as HTMLElement),
    onSelectionUpdate: ({ editor }) => syncHeadings(editor.view.dom as HTMLElement),
  });

  // Источник истины для сохранённого HTML — сам editor в момент отправки
  // формы, а не побайтовая синхронизация на каждое onUpdate: так содержимое
  // гарантированно свежее, независимо от того, сколько транзакций накопилось.
  function handleSubmit() {
    if (editor && contentInputRef.current) {
      contentInputRef.current.value = editor.getHTML();
    }
    // Метку подставляем в момент отправки: она могла обновиться предыдущим
    // удачным сохранением.
    if (baseInputRef.current) {
      baseInputRef.current.value = forceNextSaveRef.current ? "" : baseUpdatedAtRef.current;
      forceNextSaveRef.current = false;
    }
  }

  return (
    <div className="flex">
      <div className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="pageId" value={pageId} />
          <input ref={contentInputRef} type="hidden" name="content" defaultValue={initialContent} />
          <input ref={baseInputRef} type="hidden" name="baseUpdatedAt" defaultValue={initialUpdatedAt} />

          {canEdit ? (
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название статьи"
              className="w-full border-none bg-transparent text-3xl font-bold tracking-tight text-neutral-900 outline-none placeholder:text-neutral-300"
            />
          ) : (
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">{title}</h1>
          )}

          {canEdit && <EditorToolbar editor={editor} />}

          <div
            className={`tiptap-content ${
              canEdit ? "rounded-xl border border-neutral-200 bg-white px-5 py-4 focus-within:border-neutral-300" : ""
            }`}
          >
            <EditorContent editor={editor} />
          </div>

          {canEdit && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
                >
                  {pending ? "Сохранение…" : "Сохранить"}
                </button>
                {state?.ok && <span className="text-sm text-emerald-600">Сохранено</span>}
                {state && !state.ok && !state.conflict && (
                  <span className="text-sm text-red-600">{state.error}</span>
                )}
              </div>

              {/* Конфликт — не обычная ошибка в строку: человек только что
                  потратил время на правку, и ему нужно объяснение и выбор,
                  а не красная надпись. Текст остаётся в редакторе в любом
                  случае. */}
              {state && !state.ok && state.conflict && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900">Статью изменил кто-то другой</p>
                  <p className="mt-1 text-sm text-amber-800">{state.error}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={`/pages/${pageId}/history`}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                    >
                      Открыть историю версий
                    </a>
                    <button
                      type="button"
                      onClick={handleForceSave}
                      disabled={pending}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                    >
                      Сохранить поверх
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* mt-6 — чтобы вертикальная линия начиналась заметно ниже строки с
          кнопками («История», статус свежести, «Удалить»), а не упиралась
          в них: линия тянется во всю высоту флекс-контейнера, а он
          начинается сразу под шапкой страницы. */}
      <aside className="mt-6 hidden w-72 shrink-0 border-l border-neutral-200 px-5 pb-6 pt-0 xl:block">
        <div className="text-xs font-semibold tracking-wide text-neutral-400">СОДЕРЖАНИЕ СТРАНИЦЫ</div>
        {headings.length > 0 ? (
          <ul className="mt-3 space-y-2.5 border-l border-neutral-200 pl-3 text-sm">
            {headings.map((h) => (
              <li key={h.id} style={{ paddingLeft: (h.level - 1) * 10 }}>
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="text-left text-neutral-500 transition-colors hover:text-indigo-700"
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">В статье пока нет заголовков.</p>
        )}
      </aside>
    </div>
  );
}
