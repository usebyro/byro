import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

export const GET = (req: NextRequest) => adminProxy(req, "admin/push/");
export const POST = (req: NextRequest) => adminProxy(req, "admin/push/");
export const DELETE = (req: NextRequest) => adminProxy(req, "admin/push/");
