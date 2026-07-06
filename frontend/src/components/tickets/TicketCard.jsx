import API from "@/services/api";

function formatDate(day) {
  if (!day) return "";
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(time) {
  if (!time) return "";
  return new Date(`1970-01-01T${time}`).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function TicketCard({ ticket }) {
  return (
    <div className="rounded-3xl overflow-hidden shadow-xl border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0f0a2e] via-[#4c1d95] to-[#a855f7] px-6 pt-7 pb-6">
        <span className="inline-flex items-center gap-1.5 bg-white/15 text-white text-[10px] font-bold uppercase tracking-wide px-3 py-1 rounded-full mb-3">
          &#9679; Event
        </span>
        <h2 className="text-white text-xl font-bold leading-snug">{ticket.event_name}</h2>
        {ticket.tier_name && (
          <p className="text-white/70 text-sm mt-1">{ticket.tier_name}</p>
        )}
      </div>

      {/* Details */}
      <div className="bg-[#f8fafc] border border-t-0 border-gray-100 px-6 py-6">
        <div className="grid grid-cols-2 gap-y-4 mb-5">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Date</p>
            <p className="text-sm font-semibold text-gray-900">{formatDate(ticket.event_date)}</p>
          </div>
          {ticket.event_time && (
            <div>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Time</p>
              <p className="text-sm font-semibold text-gray-900">{formatTime(ticket.event_time)}</p>
            </div>
          )}
          {ticket.event_location && (
            <div className="col-span-2">
              <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Venue</p>
              <p className="text-sm font-semibold text-gray-900">{ticket.event_location}</p>
            </div>
          )}
          <div className="col-span-2">
            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Attendee</p>
            <p className="text-sm font-semibold text-gray-900">{ticket.current_owner_name}</p>
            <p className="text-xs text-gray-500">{ticket.current_owner_email}</p>
          </div>
        </div>

        {/* Tear-off divider */}
        <div className="border-t-2 border-dashed border-gray-300 my-5" />

        {/* QR code */}
        <div className="flex flex-col items-center">
          <img
            src={API.getTicketQrUrl(ticket.ticket_id)}
            alt="Ticket QR code"
            width={200}
            height={200}
            className="rounded-xl border border-gray-200"
          />
          <p className="text-xs text-gray-400 mt-3">Present this QR code at the gate for entry</p>
        </div>
      </div>
    </div>
  );
}
