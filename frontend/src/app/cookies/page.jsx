import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieSettingsButton from "@/components/CookieSettingsButton";

export const metadata = {
  title: "Cookie Policy | Byro",
  description: "What Byro stores in your browser, why, and how to change your choices.",
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-14">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Cookie Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: October 7, 2026</p>

        <div className="prose prose-sm max-w-none text-gray-600 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. What this covers</h2>
            <p>
              Byro and the tools we use store small pieces of data in your browser (cookies and local
              storage). This page lists what they are and which ones you can switch off. Essential
              items are always on because the site cannot work without them. Everything else waits
              for your choice.
            </p>
            <div className="mt-4">
              <CookieSettingsButton />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Essential (always on)</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Sign-in.</strong> Keeps you signed in to your Byro account.</li>
              <li><strong>Checkout and payments.</strong> Paystack handles card and bank payments on its own pages, under its own policy.</li>
              <li><strong>Security.</strong> A Cloudflare Turnstile check helps block bots when you sign in or buy a ticket.</li>
              <li><strong>Your choice.</strong> We remember your answer to the cookie banner so we do not ask on every visit.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Analytics (off until you accept)</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Google Analytics.</strong> Shows us which pages and events people look at and where they drop out of checkout. It does not store anything until you accept.</li>
              <li><strong>Session replay.</strong> When you accept, Sentry may record a sample of visits so we can see what went wrong when something breaks. Without your consent, no replays are recorded.</li>
            </ul>
            <p className="mt-2">
              Error reports (what broke and in which browser) are sent to Sentry either way, so we can
              fix problems. They do not include a recording of your visit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Marketing (off until you accept)</h2>
            <p>
              If you turn this on, we may use advertising pixels, such as the Meta Pixel, and
              Google&apos;s advertising signals. They help us measure our ads and show Byro to people who
              may like it. They stay off until you accept, and you can switch them off at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Live chat</h2>
            <p>
              The chat widget (Tawk.to) lets you message our support team. It stores a cookie to
              remember your conversation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Changing your mind</h2>
            <p>
              You can change your choices at any time with the button above or the &quot;Cookie
              settings&quot; button at the bottom left of the site. You can also clear cookies in your
              browser settings. Doing so signs you out.
            </p>
            <p className="mt-2">
              Questions? Write to{" "}
              <a href="mailto:support@usebyro.com" className="text-brand font-semibold">support@usebyro.com</a>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
