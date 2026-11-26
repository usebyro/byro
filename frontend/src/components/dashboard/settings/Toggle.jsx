"use client";

// One setting that is on or off, as a row inside a Settings card. Saves as soon as it is flipped.
export default function Toggle({ on, label, ariaLabel, hint, onChange, disabled }) {
  return (
    <div className="s-nrow">
      <span className="s-nlab">
        <b>{label}</b>
        <span className="v-hint">{hint}</span>
      </span>
      <span className="s-ncol">
        <button type="button" role="switch" aria-checked={on} aria-label={ariaLabel || label} disabled={disabled} onClick={onChange} className="s-swt">
          <span />
        </button>
      </span>
    </div>
  );
}
