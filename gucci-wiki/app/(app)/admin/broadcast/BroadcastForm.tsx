"use client";

import { useActionState } from "react";
import { sendBroadcastAction, type BroadcastState } from "@/lib/telegram/actions";

export default function BroadcastForm() {
  const [state, formAction, pending] = useActionState<BroadcastState, FormData>(sendBroadcastAction, null);

  return (
    <div className="mt-6 space-y-5">
      <form action={formAction} className="rounded-2xl border border-neutral-200 bg-white p-6">
        <label className="mb-1 block text-sm font-medium text-neutral-700">Текст сообщения</label>
        <textarea
          name="text"
          rows={5}
          placeholder="Например: завтра плановые работы, база знаний будет недоступна с 10 до 11"
          className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60"
          >
            {pending ? "Отправляем..." : "Отправить всем"}
          </button>
          {state?.ok && (
            <span className="text-sm text-emerald-600">
              Отправлено {state.sent}{state.failed > 0 ? `, не доставлено ${state.failed}` : ""}
            </span>
          )}
          {state && !state.ok && <span className="text-sm text-red-600">{state.error}</span>}
        </div>
      </form>
    </div>
  );
}
