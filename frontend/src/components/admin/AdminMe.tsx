"use client";

import { createContext, useContext } from "react";

export type AdminRole = "viewer" | "admin" | "owner";

export interface AdminMe {
  email: string;
  role: AdminRole;
  can: {
    moderate: boolean;
    payouts: boolean;
    delete: boolean;
    manage_roles: boolean;
    manage_team: boolean;
  };
}

// Mirrors what Django will enforce. The UI hides what a role can't do;
// the API is what actually refuses it.
const NO_ACCESS: AdminMe["can"] = {
  moderate: false, payouts: false, delete: false, manage_roles: false, manage_team: false,
};

export const AdminMeContext = createContext<AdminMe | null>(null);

export function useAdminMe(): AdminMe {
  return useContext(AdminMeContext) ?? { email: "", role: "viewer", can: NO_ACCESS };
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  viewer: "Viewer",
  admin: "Admin",
  owner: "Owner",
};
