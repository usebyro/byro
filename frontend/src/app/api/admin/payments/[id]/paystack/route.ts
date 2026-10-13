import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

const target = async ({ params }: Ctx) => `admin/payments/${(await params).id}/paystack/`;

export const GET = async (req: NextRequest, ctx: Ctx) => adminProxy(req, await target(ctx), { passQuery: false });
export const POST = async (req: NextRequest, ctx: Ctx) => adminProxy(req, await target(ctx), { body: false });
