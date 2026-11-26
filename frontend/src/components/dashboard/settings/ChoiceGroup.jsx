"use client";

import { useId, useRef } from "react";

// One choice out of a few, each with a line of explanation. Arrow keys move between the choices.
// options: [{ value, label, hint, isDefault }]
export default function ChoiceGroup({ label, hint, options, value, onChange, disabled }) {
  const refs = useRef([]);
  const labelId = useId();

  const onKeyDown = (e) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const at = Math.max(0, options.findIndex((o) => o.value === value));
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : options.length - 1;
    const next = (at + step) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="s-erow">
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-[15px] font-extrabold">{label}</span>
        {hint && <span className="v-hint">{hint}</span>}
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className="s-ropts" onKeyDown={onKeyDown}>
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className="s-ropt"
          >
            <span className="s-rad" />
            <span className="flex flex-1 flex-col gap-px">
              <span className="flex items-center gap-2">
                <b>{o.label}</b>
                {o.isDefault && <span className="s-deftag">Default</span>}
              </span>
              <span className="v-hint">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
