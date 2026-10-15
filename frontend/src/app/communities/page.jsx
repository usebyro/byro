import { apiGet } from "@/lib/serverApi";
import CommunitiesClient from "./CommunitiesClient";

// Rendered on the server with the first page of communities, so the directory is in the HTML.
export default async function CommunitiesPage() {
  const data = await apiGet("communities/?page_size=12");
  return <CommunitiesClient initialData={data} />;
}
