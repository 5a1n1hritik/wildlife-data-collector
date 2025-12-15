const ENDPOINT = "https://query.wikidata.org/sparql";

export async function fetchMammalSpecies() {
  const query = `
  SELECT ?item ?itemLabel ?scientificName WHERE {
    ?item wdt:P31 wd:Q16521;
          wdt:P105 wd:Q7432;
          wdt:P171* wd:Q7377;
          wdt:P225 ?scientificName.
    SERVICE wikibase:label {
      bd:serviceParam wikibase:language "en".
    }
  }
  `;

  const url =
    ENDPOINT +
    "?format=json&query=" +
    encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "TDAcorp/Species-Discovery"
    }
  });

  if (!res.ok) {
    throw new Error("SPARQL request failed");
  }

  return res.json();
}
