import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ ref: string }> };

// Body: { outcome: "release" | "refund" }. `ref` is the order number, like BY-K7M4QX.
export const POST = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/merch-orders/${encodeURIComponent((await params).ref)}/resolve/`);
