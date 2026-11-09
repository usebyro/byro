import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

export const GET = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/users/${(await params).id}/email-change/`);
export const POST = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/users/${(await params).id}/email-change/`);
export const DELETE = async (req: NextRequest, { params }: Ctx) =>
  adminProxy(req, `admin/users/${(await params).id}/email-change/`);
