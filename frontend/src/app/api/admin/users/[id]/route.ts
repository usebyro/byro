import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/users/${(await params).id}/`);
