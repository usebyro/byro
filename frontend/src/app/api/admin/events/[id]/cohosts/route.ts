import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/events/${(await params).id}/cohosts/`);
