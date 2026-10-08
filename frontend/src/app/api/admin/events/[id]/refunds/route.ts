import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

// Here `id` is the event's numeric id. Body: { action: "send" | "continue" | "retry", confirm_low_balance? }
export const POST = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/events/${(await params).id}/refunds/`);
