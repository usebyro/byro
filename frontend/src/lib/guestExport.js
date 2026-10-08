/**
 * Guest list export: the CSV a spreadsheet opens, with one column for each question
 * the organiser asked at checkout.
 */

// Anything a guest typed ends up in this file, and spreadsheets run text that starts like a
// formula. Prefix those with an apostrophe so they stay text. Numbers and phone numbers
// (+234 801 234 5678) are left alone.
function neutralise(text) {
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text)) return `'${text}`;
  return text;
}

export function csvCell(value) {
  const text = neutralise(String(value ?? ""));
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

/** attendees: the dashboard's guest rows. questions: [{id, question}] in the order the organiser set them. */
export function buildGuestCsv(attendees, questions = []) {
  const header = [
    "#", "Name", "Email", "Ticket type", "Reference", "Payment", "Checked in", "Checked in at", "Registered",
    ...questions.map((q) => q.question),
  ];
  const rows = attendees.map((a, i) => {
    const byQuestion = new Map((a.answers || []).map((x) => [x.questionId, x.answer]));
    return [
      i + 1,
      a.name,
      a.email,
      a.tier,
      a.ref,
      a.paymentStatus === "free" ? "Free" : a.paymentStatus === "paid" ? "Paid" : a.paymentStatus,
      a.checkedIn ? "Yes" : "No",
      dateTime(a.checkedInAt),
      dateTime(a.registeredAt),
      ...questions.map((q) => byQuestion.get(q.id) ?? ""),
    ];
  });
  // The BOM makes Excel read the file as UTF-8, so names and the naira sign survive.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
