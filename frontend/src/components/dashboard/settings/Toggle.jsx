"use client";

// One setting that is on or off. Saves as soon as it is flipped.
export default function Toggle({ on, label, hint, onChange, disabled }) {
  return (
    <div className="flex items-start gap-4 py-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold">{label}</span>
        <span className="v-hint">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none ${
          on ? "bg-brand" : "bg-[#CBD3DF]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${on ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}
