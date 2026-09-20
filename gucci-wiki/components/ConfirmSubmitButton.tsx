"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// Тонкая обёртка над кнопкой отправки формы с server action: спрашивает
// подтверждение перед необратимым действием (удаление пространства/статьи
// и т.д.). Раньше подтверждение — браузерный `confirm()`, системный попап
// вне стиля вики (правка пользователя); теперь — своя модалка
// (components/ConfirmDialog.tsx). Кнопка сама больше не `type="submit"` —
// клик открывает модалку, а реальная отправка формы происходит
// программно (`form.requestSubmit()`) только по подтверждению.
export default function ConfirmSubmitButton({
  confirmMessage,
  confirmLabel,
  className,
  children,
}: {
  confirmMessage: string;
  confirmLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(e) => {
          formRef.current = e.currentTarget.closest("form");
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open && (
        <ConfirmDialog
          message={confirmMessage}
          confirmLabel={confirmLabel}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            formRef.current?.requestSubmit();
          }}
        />
      )}
    </>
  );
}
