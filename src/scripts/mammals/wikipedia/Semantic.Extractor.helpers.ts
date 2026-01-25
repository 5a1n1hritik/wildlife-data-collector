export function splitSections(wikitext: string) {
  const regex = /^(={2,6})\s*(.+?)\s*\1\s*$/gm;

  const matches = [...wikitext.matchAll(regex)];

  const sections: {
    title: string;
    level: number;
    raw: string;
  }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const level = matches[i][1].length; // == → 2, === → 3
    const start = matches[i].index! + matches[i][0].length;
    const end = matches[i + 1]?.index ?? wikitext.length;

    sections.push({
      title: matches[i][2].trim(),
      level,
      raw: wikitext.slice(start, end).trim(),
    });
  }

  return sections;
}

export function buildSectionTree(flat: any[]) {
  const root: any[] = [];
  const stack: any[] = [];

  for (const sec of flat) {
    const node = { ...sec, children: [] };

    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}

export function cleanTextForMarkdown(text: string): string {
  return text
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''+(.*?)'''+/g, "**$1**")
    .replace(/''+(.*?)''+/g, "_$1_")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function normalizeWhitespace(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function extractImages(sectionRaw: string): string[] {
  const files = sectionRaw.match(/\[\[(?:File|Image):([^\|\]]+)/gi) || [];

  return files.map((f) => {
    const name = f
      .replace(/\[\[(?:File|Image):/i, "")
      .replace(/\]\]/, "")
      .trim();

    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
      name,
    )}?width=1000`;
  });
}

export function extractGalleryImages(text: string): string[] {
  const galleryRegex = /<gallery[\s\S]*?>([\s\S]*?)<\/gallery>/gi;
  const match = galleryRegex.exec(text);
  if (!match) return [];

  return match[1]
    .split("\n")
    .map((line) => {
      const m = line.match(/(?:File|Image):([^|\]\n]+)/i);
      return m
        ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
            m[1].trim(),
          )}?width=1000`
        : null;
    })
    .filter(Boolean) as string[];
}

function inferGenderFromFilename(filename: string) {
  const f = filename.toLowerCase();

  if (/(male|stag|bull|ram|buck|♂)/.test(f)) return "male";
  if (/(female|doe|cow|♀)/.test(f)) return "female";

  return null;
}

export function findGenderImages(
  sections: {
    title: string;
    images: string[];
  }[],
): { male: string | null; female: string | null } {
  let male: string | null = null;
  let female: string | null = null;

  for (const section of sections) {
    for (const img of section.images) {
      const decoded = decodeURIComponent(img);
      const fileName = decoded.split("/").pop() ?? "";

      const inferred = inferGenderFromFilename(fileName);

      if (inferred === "male" && !male) {
        male = img;
      }

      if (inferred === "female" && !female) {
        female = img;
      }

      if (male && female) return { male, female };
    }
  }

  return { male, female };
}

export function stripImageMarkup(text: string): string {
  return text
    .replace(/\[\[(File|Image):[^\]]+\]\]/gi, "")
    .replace(/<gallery[\s\S]*?<\/gallery>/gi, "");
}

export function extractMapFromInfobox(
  infoboxRaw: string | null,
): string | null {
  if (!infoboxRaw) return null;

  const match =
    infoboxRaw.match(
      /\|\s*(range_map|distribution_map)\s*=\s*([^\n|]+)/i,
    );

  if (!match) return null;

  const fileName = match[2].trim().replace(/ /g, "_");

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    fileName,
  )}?width=1000`;
}

export function findMapImage(images: string[]): string | null {
  const keywords = ["map", "range", "distribution", "habitat"];

  return (
    images.find((img) =>
      keywords.some((k) => img.toLowerCase().includes(k)),
    ) ?? null
  );
}

function convertWikiTableToMarkdown(table: string): string {
  const lines = table.split("\n");

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let isHeaderRow = false;

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("{|") || line === "|}") continue;

    // new row
    if (line === "|-") {
      if (currentRow.length) {
        rows.push(currentRow);
        currentRow = [];
      }
      isHeaderRow = false;
      continue;
    }

    // header cell
    if (line.startsWith("!")) {
      isHeaderRow = true;
      const cell = cleanTextForMarkdown(line.replace(/^!+/, ""));
      currentRow.push(cell);
      continue;
    }

    // data cell
    if (line.startsWith("|")) {
      const cell = cleanTextForMarkdown(line.replace(/^\|+/, ""));
      currentRow.push(cell);
      continue;
    }
  }

  if (currentRow.length) rows.push(currentRow);

  if (rows.length < 2) return "";

  const header = rows[0];
  const body = rows.slice(1);

  const colCount = Math.max(header.length, ...body.map((r) => r.length));

  const md: string[] = [];

  md.push(`| ${pad(header, colCount).join(" | ")} |`);
  md.push(`| ${Array(colCount).fill("---").join(" | ")} |`);

  for (const row of body) {
    md.push(`| ${pad(row, colCount).join(" | ")} |`);
  }

  return "\n" + md.join("\n");
}

function pad(row: string[], len: number) {
  return Array.from({ length: len }, (_, i) => row[i] ?? "");
}

export function stripTables(text: string) {
  return text.replace(/\{\|[\s\S]*?\|\}/g, "");
}

export function extractTables(sectionRaw: string): string[] {
  const tables = sectionRaw.match(/\{\|[\s\S]*?\|\}/g) || [];
  return tables.map(convertWikiTableToMarkdown).filter(Boolean);
}

export function convertWikiTextToMarkdown(raw: string): string {
  let text = raw;

  text = stripImageMarkup(text);

  // Headings: == Heading == → ## Heading
  text = text.replace(/^======\s*(.*?)\s*======$/gm, "###### $1");
  text = text.replace(/^=====\s*(.*?)\s*=====$/gm, "##### $1");
  text = text.replace(/^====\s*(.*?)\s*====$/gm, "#### $1");
  text = text.replace(/^===\s*(.*?)\s*===$/gm, "### $1");
  text = text.replace(/^==\s*(.*?)\s*==$/gm, "## $1");

  // Unordered lists: * item → - item
  text = text.replace(/^\*+\s+/gm, "- ");

  // Ordered lists: # item → 1. item
  text = text.replace(/^#+\s+/gm, "1. ");

  // Bold & italic (safety pass)
  text = text.replace(/'''+(.*?)'''+/g, "**$1**");
  text = text.replace(/''+(.*?)''+/g, "_$1_");

  text = cleanTextForMarkdown(text);
  text = normalizeWhitespace(text);

  return text;
}
