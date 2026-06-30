import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/mailer";
import { TicketConfirmation } from "@/lib/emails/TicketConfirmation";
import { PayoutRequest } from "@/lib/emails/PayoutRequest";
import { EventReminder } from "@/lib/emails/EventReminder";
import { EventCreated } from "@/lib/emails/EventCreated";

const emailTemplates = {
  ticket: TicketConfirmation,
  payout: PayoutRequest,
  reminder: EventReminder,
  event_created: EventCreated,
};

export async function POST(request) {
  try {
    const { emails } = await request.json();

    if (!Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ success: false, error: "No emails provided" }, { status: 400 });
    }

    const results = [];
    for (const { type, to, data } of emails) {
      if (!emailTemplates[type]) {
        results.push({ to, success: false, error: "Unknown email type" });
        continue;
      }

      let template;
      if (type === "ticket") {
        template = emailTemplates[type](data.name, data.eventName, data.date, data.time, data.location, data.ticketId);
      } else if (type === "payout") {
        template = emailTemplates[type](data.name, data.amount, data.eventName);
      } else if (type === "reminder") {
        template = emailTemplates[type](data.name, data.subject, data.message, data.eventName);
      } else if (type === "event_created") {
        template = emailTemplates[type](data.name, data.eventName, data.eventDate, data.eventTime, data.eventLocation, data.eventLink);
      }

      try {
        const result = await sendEmail({
          to,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });
        results.push({ to, success: true, provider: result.provider });
      } catch (error) {
        results.push({ to, success: false, error: error.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Batch email error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
