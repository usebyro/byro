import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ kind: string }> };

export const GET = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/export/${(await params).kind}/`, { raw: true });
