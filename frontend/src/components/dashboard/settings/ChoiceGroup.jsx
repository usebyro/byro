"use client";

import { useRef } from "react";

// One choice out of a few, each with a line of explanation. A radio group: arrow keys move between the choices.
// options: [{ value, label, hint, isDefault }]
export default function ChoiceGroup({ label, hint, options, value, onChange, disabled }) {
  const refs = useRef([]);

  const onKeyDown = (e) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const at = Math.max(0, options.findIndex((o) => o.value === value));
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : options.length - 1;
    const next = (at + step) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="flex flex-col gap-0.5">
        <span id={`choice-${label}`} className="text-[15px] font-bold">{label}</span>
        {hint && <span className="v-hint">{hint}</span>}
      </div>
      <div role="radiogroup" aria-labelledby={`choice-${label}`} className="flex flex-col gap-2" onKeyDown={onKeyDown}>
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`flex min-h-[56px] items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none ${
                on ? "border-brand bg-[#EEF3FF]" : "border-hairline bg-white hover:bg-[#F7F9FC]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-brand" : "border-[#B8C0CE]"}`}
              >
                {on && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[15px] font-bold">
                  {o.label}
                  {o.isDefault && (
                    <span className="rounded-full bg-[#EAEEF5] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#5B6272]">Default</span>
                  )}
                </span>
                <span className="v-hint">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
