/* Byro admin service worker: shows push notifications and opens the right page when tapped.
   It handles push only (no caching, no fetch handler), so it never changes how pages load. */

// On admin.usebyro.com admin paths have no prefix; on usebyro.com they live under /admin.
const adminPath = (link) => {
  const prefix = self.location.hostname.startsWith("admin.") ? "" : "/admin";
  return prefix + (link && link.startsWith("/") ? link : "/");
};

// Is this browser tab showing the admin (not a public Byro page on the same domain)?
const isAdminTab = (w) => {
  const u = new URL(w.url);
  return u.origin === self.location.origin && (self.location.hostname.startsWith("admin.") || u.pathname === "/admin" || u.pathname.startsWith("/admin/"));
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Byro" };
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Someone is looking at the admin right now: it shows its own pop-up, so don't double up.
      if (windows.some((w) => w.focused && isAdminTab(w))) return;
      return self.registration.showNotification(data.title || "Byro", {
        body: data.body || "",
        tag: data.tag,
        icon: "/favicon_io/android-chrome-192x192.png",
        badge: "/favicon_io/favicon-32x32.png",
        data: { url: adminPath(data.link) },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || adminPath("/"), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse an open admin tab if there is one, otherwise open a new one.
      const tab = windows.find(isAdminTab);
      if (tab) return tab.navigate(url).then((w) => (w || tab).focus());
      return self.clients.openWindow(url);
    }),
  );
});
