import { secureFetch } from "./w1.collector.ts";

export async function fetchWikitext(title: string): Promise<string | null> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query` +
    `&prop=revisions` +
    `&rvprop=content` +
    `&rvslots=main` +
    `&redirects=1` +
    `&titles=${encodeURIComponent(title)}` +
    `&format=json&formatversion=2&origin=*`;

  const json = await secureFetch(url);

  //   const json = await res.json();
  const page = json?.query?.pages?.[0];
  if (!page || page.missing) return null;

  return page.revisions?.[0]?.slots?.main?.content ?? null;
}
