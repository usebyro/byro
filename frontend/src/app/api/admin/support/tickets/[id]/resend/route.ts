import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  return adminProxy(req, `admin/support/tickets/${id}/resend/`);
};
