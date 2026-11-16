import MerchOrderClient from "./MerchOrderClient";

export const metadata = {
  title: "Your merch order | Byro",
  // The link carries the buyer's key, so it should never show up in search.
  robots: { index: false, follow: false },
};

export default async function MerchOrderPage({ params }) {
  const { ref } = await params;
  return <MerchOrderClient orderRef={ref} />;
}
