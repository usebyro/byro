import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ ref: string }> };

// Body: { reason }. Refunds one order outside the problem flow, for example after the window to report closed.
export const POST = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/merch-orders/${encodeURIComponent((await params).ref)}/refund/`);
