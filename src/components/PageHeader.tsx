import { type ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-2.5 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight text-zinc-100">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
