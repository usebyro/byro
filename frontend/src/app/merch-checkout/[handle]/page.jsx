import MerchCheckoutClient from "./MerchCheckoutClient";

export const metadata = {
  title: "Merch checkout | Byro",
  robots: { index: false, follow: false },
};

export default async function MerchCheckoutPage({ params }) {
  const { handle } = await params;
  return <MerchCheckoutClient handle={handle} />;
}
