// The link is the credential, so keep it out of search results and out of referrer headers.
export const metadata = {
  title: "Claim your event",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ClaimLayout({ children }) {
  return children;
}
