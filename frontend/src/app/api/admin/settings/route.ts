import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

export const GET = (req: NextRequest) => adminProxy(req, "admin/settings/");
export const PATCH = (req: NextRequest) => adminProxy(req, "admin/settings/");
