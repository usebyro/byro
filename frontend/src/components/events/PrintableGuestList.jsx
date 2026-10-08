"use client";

import { forwardRef } from "react";

const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/**
 * The guest list laid out for paper / "Save as PDF". Each guest is a row, and the
 * answers they gave to the organiser's questions sit under their name so they stay
 * readable however many questions there are.
 */
const PrintableGuestList = forwardRef(function PrintableGuestList({ attendees, questions, event }, ref) {
  const byId = new Map(questions.map((q) => [q.id, q.question]));
  const inCount = attendees.filter((a) => a.checkedIn).length;
  const date = event?.day
    ? new Date(event.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "";

  return (
    <div ref={ref} className="p-6 text-gray-900" style={{ fontFamily: "system-ui, sans-serif" }}>
      <h1 className="text-xl font-bold">{event?.name} · Guest list</h1>
      <p className="text-sm text-gray-600 mt-1">
        {[date, event?.location].filter(Boolean).join(" · ")}
      </p>
      <p className="text-sm text-gray-600 mb-4">
        {attendees.length} guest{attendees.length === 1 ? "" : "s"} · {inCount} checked in
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="border border-gray-300 px-2 py-1.5 w-8">#</th>
            <th className="border border-gray-300 px-2 py-1.5">Guest</th>
            <th className="border border-gray-300 px-2 py-1.5">Ticket</th>
            <th className="border border-gray-300 px-2 py-1.5">Checked in</th>
          </tr>
        </thead>
        <tbody>
          {attendees.map((a, i) => {
            const answered = (a.answers || []).filter((x) => x.answer !== "");
            return (
              <tr key={a.id} style={{ breakInside: "avoid" }}>
                <td className="border border-gray-300 px-2 py-1.5 align-top">{i + 1}</td>
                <td className="border border-gray-300 px-2 py-1.5 align-top">
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-gray-600">{a.email}</div>
                  {answered.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs">
                      {answered.map((x) => (
                        <li key={x.questionId}>
                          <span className="text-gray-500">{byId.get(x.questionId) || x.question}: </span>
                          <span className="font-medium break-words">{x.answer}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="border border-gray-300 px-2 py-1.5 align-top">
                  {a.tier}
                  <div className="text-xs text-gray-500">{a.ref}</div>
                </td>
                <td className="border border-gray-300 px-2 py-1.5 align-top">{a.checkedIn ? `Yes ${when(a.checkedInAt)}` : "No"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default PrintableGuestList;
