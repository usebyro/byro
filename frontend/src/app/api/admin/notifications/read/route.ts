import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

export const POST = (req: NextRequest) => adminProxy(req, "admin/notifications/read/");
