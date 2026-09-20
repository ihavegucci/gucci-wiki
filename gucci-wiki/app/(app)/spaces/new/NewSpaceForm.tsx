"use client";

import { useActionState } from "react";
import { createSpaceAction, type CreateSpaceState } from "@/lib/spaces/actions";
import { getSpaceIcon, getSpaceColorClasses, SPACE_ICON_KEYS, SPACE_COLOR_KEYS } from "@/lib/spaces/icons";

export default function NewSpaceForm() {
  const [state, formAction, pending] = useActionState<CreateSpaceState, FormData>(createSpaceAction, null);

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-neutral-700">
          Название
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Например, Юридический отдел"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-neutral-700">
          Описание
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          placeholder="Коротко — о чём это пространство"
          className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-neutral-700">Иконка</legend>
        <div className="flex flex-wrap gap-2">
          {SPACE_ICON_KEYS.map((key, i) => {
            const Icon = getSpaceIcon(key);
            return (
              <label key={key} className="cursor-pointer">
                <input
                  type="radio"
                  name="icon"
                  value={key}
                  defaultChecked={i === 0}
                  className="peer sr-only"
                />
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-checked:text-white">
                  <Icon size={16} />
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-neutral-700">Цвет</legend>
        <div className="flex flex-wrap gap-2">
          {SPACE_COLOR_KEYS.map((key, i) => (
            <label key={key} className="cursor-pointer">
              <input type="radio" name="color" value={key} defaultChecked={i === 0} className="peer sr-only" />
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ring-offset-2 peer-checked:ring-2 peer-checked:ring-neutral-900 ${getSpaceColorClasses(key)}`}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {pending ? "Создание…" : "Создать пространство"}
      </button>
    </form>
  );
}
