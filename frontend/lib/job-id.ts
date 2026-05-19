/** Extract LinkedIn (or similar) job id from a page URL. */
export function extractJobId(sourceUrl: string): string {
  if (!sourceUrl.trim()) {
    return "";
  }

  try {
    const url = new URL(sourceUrl);
    const fromQuery =
      url.searchParams.get("currentJobId") ??
      url.searchParams.get("jobId") ??
      url.searchParams.get("job_id");
    if (fromQuery) {
      return fromQuery;
    }

    const pathMatch = url.pathname.match(/\/jobs\/view\/(\d+)/i);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }
  } catch {
    // ignore invalid URLs
  }

  return "";
}
