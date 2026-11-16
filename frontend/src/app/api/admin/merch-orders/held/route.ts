import type { NextRequest } from "next/server";
import { adminProxy } from "@/lib/adminProxy";

// Merch orders with an open problem from the buyer.
export const GET = async (req: NextRequest) => adminProxy(req, "admin/merch-orders/held/");
