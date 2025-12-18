// import fs from "fs";
// import path from "path";

// const INPUT = "src/data/species/mammals";
// const CURATED = "src/data/curated/mammals";
// const REJECTED = "src/data/rejected/mammals";

// fs.mkdirSync(CURATED, { recursive: true });
// fs.mkdirSync(REJECTED, { recursive: true });

// const report = {
//   total: 0,
//   accepted: 0,
//   rejected: 0,
//   reasons: {} as Record<string, number>
// };

// const files = fs.readdirSync(INPUT);

// for (const file of files) {
//   const data = JSON.parse(
//     fs.readFileSync(path.join(INPUT, file), "utf-8")
//   );

//   report.total++;

//   const reason = (() => {
//     if (!data.description) return "no_description";
//     if (data.description.length < 200) return "short_description";
//     if (!data.image) return "no_image";
//     if (!data.source?.wikipedia) return "no_wikipedia";

//     const badWords = ["extinct", "fossil", "prehistoric", "†"];
//     if (badWords.some(w => data.description.toLowerCase().includes(w)))
//       return "extinct_or_fossil";

//     return null;
//   })();

//   if (reason) {
//     report.rejected++;
//     report.reasons[reason] = (report.reasons[reason] || 0) + 1;
//     fs.writeFileSync(
//       path.join(REJECTED, file),
//       JSON.stringify(data, null, 2)
//     );
//   } else {
//     report.accepted++;
//     fs.writeFileSync(
//       path.join(CURATED, file),
//       JSON.stringify(data, null, 2)
//     );
//   }
// }

// fs.writeFileSync(
//   "src/data/reports/mammals.curation.json",
//   JSON.stringify(report, null, 2)
// );

// console.log(report);


import fs from "fs";
import path from "path";

const INPUT = "src/data/species/mammals";
const CURATED = "src/data/curated/mammals";
const REJECTED = "src/data/rejected/mammals";
const REPORTS = "src/data/reports";

fs.mkdirSync(CURATED, { recursive: true });
fs.mkdirSync(REJECTED, { recursive: true });
fs.mkdirSync(REPORTS, { recursive: true });

const report = {
  total: 0,
  accepted: 0,
  rejected: 0,
  avgScore: 0,
  reasons: {} as Record<string, number>
};

let totalScore = 0;

const files = fs.readdirSync(INPUT);

for (const file of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(INPUT, file), "utf-8")
  );

  report.total++;

  let score = 0;
  const reasons: string[] = [];

  // ---------- HARD FAILS ----------
  if (!data.description) {
    reasons.push("no_description");
  }

  if (!data.source?.wikipedia) {
    reasons.push("no_wikipedia");
  }

  const extinctWords = ["extinct", "fossil", "prehistoric", "†"];
  if (
    data.description &&
    extinctWords.some(w =>
      data.description.toLowerCase().includes(w)
    )
  ) {
    reasons.push("extinct_or_fossil");
  }

  if (reasons.length > 0) {
    report.rejected++;
    reasons.forEach(r => {
      report.reasons[r] = (report.reasons[r] || 0) + 1;
    });

    fs.writeFileSync(
      path.join(REJECTED, file),
      JSON.stringify({ ...data, _rejectReasons: reasons }, null, 2)
    );
    continue;
  }

  // ---------- SCORING ----------
  const desc = data.description.toLowerCase();

  if (data.description.length > 400) score++;
  if (data.description.length > 700) score++;
  if (data.image) score++;

  if (desc.includes("habitat")) score++;
  if (desc.includes("diet")) score++;
  if (desc.includes("behavior")) score++;
  if (desc.includes("threat")) score++;
  if (desc.includes("human")) score++;

  totalScore += score;

  // ---------- THRESHOLD ----------
  if (score >= 3) {
    report.accepted++;
    fs.writeFileSync(
      path.join(CURATED, file),
      JSON.stringify({ ...data, _score: score }, null, 2)
    );
  } else {
    report.rejected++;
    const reason = `low_score_${score}`;
    report.reasons[reason] = (report.reasons[reason] || 0) + 1;

    fs.writeFileSync(
      path.join(REJECTED, file),
      JSON.stringify({ ...data, _score: score }, null, 2)
    );
  }
}

report.avgScore =
  report.accepted > 0
    ? Number((totalScore / report.accepted).toFixed(2))
    : 0;

fs.writeFileSync(
  path.join(REPORTS, "mammals.curation.json"),
  JSON.stringify(report, null, 2)
);

console.log(report);
