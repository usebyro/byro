import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

// The `id` segment is the event's slug here (Next requires sibling dynamic
// segments to share a name).
export const GET = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/events/${(await params).id}/attendees/`);
