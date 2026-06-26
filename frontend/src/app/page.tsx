import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Hero, BrowseByCategory, TrendingEvents, AppBanner } from "@/components/landing";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        {/* <BrowseByCategory /> */}
        <TrendingEvents />
        <AppBanner />
      </main>
      <Footer />
    </>
  );
}
