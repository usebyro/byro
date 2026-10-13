import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/payments/${(await params).id}/`, { passQuery: false });
