"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";

export default function StudioSettings() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-gray-400">Manage your studio preferences.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <HugeiconsIcon icon={Settings01Icon} size={24} color="#d1d5db" />
        </div>
        <p className="text-sm text-gray-500 font-semibold mb-1">Coming soon</p>
        <p className="text-xs text-gray-400">Studio settings will be available in an upcoming update.</p>
      </div>
    </div>
  );
}
