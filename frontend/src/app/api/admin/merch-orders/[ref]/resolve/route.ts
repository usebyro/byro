import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ ref: string }> };

// Body: { outcome: "release" | "refund" }. `ref` is the order number, like BY-0012.
export const POST = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/merch-orders/${encodeURIComponent((await params).ref)}/resolve/`);
