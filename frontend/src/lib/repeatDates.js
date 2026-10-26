// The dates a repeating event falls on. Dates are "YYYY-MM-DD", the same shape as a date input.
export const REPEAT_COUNTS = [4, 8, 12, 26];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

const parse = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "Every week on Saturday", "Every month on the 2nd Saturday"…, for the menu.
export function repeatOptions(startIso) {
  if (!startIso) return [["none", "Does not repeat"]];
  const base = parse(startIso);
  const weekday = WEEKDAYS[base.getDay()];
  const nth = Math.min(4, Math.floor((base.getDate() - 1) / 7));
  return [
    ["none", "Does not repeat"],
    ["weekly", `Every week on ${weekday}`],
    ["fortnightly", `Every 2 weeks on ${weekday}`],
    ["monthly", `Every month on the ${ORDINALS[nth]} ${weekday}`],
  ];
}

// The first `count` dates of the pattern, starting with the event's own date.
export function repeatDates(startIso, rule, count) {
  if (!startIso || rule === "none") return [];
  const base = parse(startIso);
  const nth = Math.min(4, Math.floor((base.getDate() - 1) / 7));
  const out = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    let d;
    if (rule === "monthly") {
      // The same weekday of the month (the 2nd Saturday…); a month without one is skipped.
      d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      d.setDate(1 + ((base.getDay() - d.getDay() + 7) % 7) + 7 * nth);
      if (d.getMonth() !== (((base.getMonth() + i) % 12) + 12) % 12) continue;
    } else {
      d = new Date(base);
      d.setDate(base.getDate() + i * (rule === "weekly" ? 7 : 14));
    }
    out.push(toIso(d));
  }
  return out;
}

export function repeatLabel(iso) {
  const d = parse(iso);
  const month = d.toLocaleString("en-GB", { month: "short" });
  return `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${month}`;
}
