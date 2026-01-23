import { secureFetch } from "./w1.collector.ts";

export async function fetchIntro(title: string) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query` +
    `&prop=extracts|pageimages` +
    `&exintro=1&explaintext=1` +
    `&piprop=original` +
    `&redirects=1` +
    `&titles=${encodeURIComponent(title)}` +
    `&format=json&origin=*`;

  const json = await secureFetch(url);

  //   const json = await res.json();
  const pages = json?.query?.pages;
  if (!pages) return null;

  const page = pages[Object.keys(pages)[0]];
  if (!page || page.missing) return null;

  return {
    title: page.title ?? null,
    pageid: page.pageid ?? null,
    intro_raw: page.extract ?? null,
    hero_image: page.original?.source ?? null,
  };
}
