"use client";

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  ImageIcon,
  Images,
  Loader2,
  Undo2,
  Redo2,
  Code2,
} from "lucide-react";
import FilePickerModal from "@/components/editor/FilePickerModal";
import { xhrUpload, UploadAbortedError } from "@/lib/upload/xhrUpload";
import UploadProgress, { type UploadState } from "@/components/ui/UploadProgress";

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors ${
        active ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      } disabled:pointer-events-none disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

export default function EditorToolbar({ editor }: { editor: Editor | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  if (!editor) return null;

  function setLink() {
    const previous = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Ссылка (пусто — убрать)", previous ?? "");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function pickImage() {
    setUploadError(null);
    fileInputRef.current?.click();
  }

  // Файл летит в настроенный S3-бакет (кусок 5/6, /api/upload) — в
  // редактор попадает не сам файл, а прямая ссылка на объект в бакете.
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // сброс, чтобы можно было выбрать тот же файл повторно
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setProgress({ name: file.name, loaded: 0, total: file.size });
    try {
      const body = new FormData();
      body.append("file", file);
      const upload = xhrUpload<{ url: string }>("/api/upload", body, (p) =>
        setProgress((prev) => prev && { ...prev, loaded: p.loaded, total: p.total })
      );
      abortRef.current = upload.abort;
      const data = await upload.promise;
      editor!.chain().focus().setImage({ src: data.url }).run();
    } catch (err) {
      // Отмена — не ошибка: полоса просто исчезает, красного сообщения нет.
      if (!(err instanceof UploadAbortedError)) {
        setUploadError(err instanceof Error ? err.message : "Не удалось загрузить файл.");
      }
    } finally {
      abortRef.current = null;
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
      <ToolbarButton label="Жирный" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton label="Курсив" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton label="Зачёркнутый" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={16} />
      </ToolbarButton>
      <ToolbarButton label="Код" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code2 size={16} />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-neutral-200" />

      <ToolbarButton
        label="Заголовок 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={16} />
      </ToolbarButton>
      <ToolbarButton
        label="Заголовок 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        label="Заголовок 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={16} />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-neutral-200" />

      <ToolbarButton
        label="Маркированный список"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        label="Нумерованный список"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton label="Цитата" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={16} />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-neutral-200" />

      <ToolbarButton label="Ссылка" active={editor.isActive("link")} onClick={setLink}>
        <Link2 size={16} />
      </ToolbarButton>
      <ToolbarButton label="Вставить изображение" disabled={uploading} onClick={pickImage}>
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
      </ToolbarButton>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
      <ToolbarButton label="Выбрать из файлов" onClick={() => setPickerOpen(true)}>
        <Images size={16} />
      </ToolbarButton>

      <span className="mx-1 h-5 w-px bg-neutral-200" />

      <ToolbarButton label="Отменить" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton label="Повторить" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={16} />
      </ToolbarButton>
      </div>
      {progress && <UploadProgress state={progress} onCancel={() => abortRef.current?.()} />}
      {uploadError && <p className="px-1 text-xs text-red-600">{uploadError}</p>}
      {pickerOpen && (
        <FilePickerModal
          onSelect={(url) => {
            editor!.chain().focus().setImage({ src: url }).run();
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
