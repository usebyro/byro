import { apiGet } from "@/lib/serverApi";
import DiscoverClient from "./DiscoverClient";

// Rendered on the server with the first page of events, so the list is in the HTML.
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const search = ((await searchParams).search || "").trim();
  const query = new URLSearchParams({ sort: "trending", ...(search ? { search } : {}) });
  const data = await apiGet<unknown>(`events/?${query}`);
  return <DiscoverClient search={search} initialEvents={data === null ? null : data} />;
}
