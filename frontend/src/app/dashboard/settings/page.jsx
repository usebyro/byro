"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";

export default function StudioSettings() {
  useEffect(() => {
    document.title = "Settings | Byro";
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <div className="pb-2 border-b border-gray-100/50">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-xs text-gray-450 mt-0.5">Manage your studio preferences.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100/80 p-8 text-center shadow-sm">
        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3 border border-gray-100/50">
          <HugeiconsIcon icon={Settings01Icon} size={20} color="#9ca3af" />
        </div>
        <p className="text-xs text-gray-550 font-bold mb-0.5">Coming soon</p>
        <p className="text-[11px] text-gray-400">Studio settings will be available in an upcoming update.</p>
      </div>
    </div>
  );
}
