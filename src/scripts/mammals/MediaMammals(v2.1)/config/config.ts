export const CONFIG = {
  FILES: {
    IN: "src/data/discovery/mammals/mammals.raw.json",
    OUT: "src/data/discovery/mammals/mammals.enriched.json",
    TEMP: "src/data/discovery/mammals/mammals.enriched.json.tmp",
  },
  NETWORK: {
    INITIAL_CONCURRENCY: 3,
    BATCH_MIN: 10,
    BATCH_MAX: 60,
    INITIAL_BATCH_SIZE: 50,
    TIMEOUT_MS: 20000,
    WAIT_BETWEEN_BATCHES: 1200,
  },
};

export type UnitDimension = "mass" | "length" | "time";

export const UNITS_MAP: Record<
  string,
  { label: string; factor: number; dimension: UnitDimension }
> = {
  Q11570: { label: "kg", factor: 1, dimension: "mass" }, // Kilogram
  Q41803: { label: "kg", factor: 0.001, dimension: "mass" }, // Gram -> KG
  Q11574: { label: "years", factor: 0.00273973, dimension: "time" }, // Days -> Years
  Q577: { label: "years", factor: 1, dimension: "time" }, //  Years
  Q573: { label: "Days", factor: 1, dimension: "time" }, // Days
  Q23387: { label: "Week", factor: 1, dimension: "time" }, // week
  Q5151: { label: "Month", factor: 1, dimension: "time" }, // month
  Q174728: { label: "cm", factor: 1, dimension: "length" }, // Centimetre
  Q11573: { label: "cm", factor: 100, dimension: "length" }, // Metre -> CM
};

export const IUCN_MAP: Record<string, string> = {
  Q237350: "Extinct (EX)",
  Q239509: "extinct in the wild (EW)",
  Q219127: "Critically Endangered (CR)",
  Q96377276: "Endangered (EN)",
  Q278113: "Vulnerable (VU)",
  Q719675: "Near Threatened (NT)",
  Q211005: "Least Concern (LC)",
  Q3245245: "Data Deficient (DD)",
};

export const MAMMAL_CLAIMS = {
  physical: [
    "P2067", // mass
    "P2257", // lifespan
    "P2048", // height
    "P2049", // width
    "P3063", // Pregnancy duration
    "P3488",
    "P3487",
    "P7770",
    "P171",
    "P1843",
    "P105",
    "P225",
    "P18",
    "P373",
  ],
  reproduction: [
    "P2574", // gestation
    "P7725", // litter size
    "P3439", // weaning age
    "P7862",
    "P12432",
    "P1264",
  ],
  ecology: [
    "P2974", // habitat
    "P1034", // diet
    "P3811", // trophic level
    "P522", // activity
    "P2093",
    "P3151",
  ],
  conservation: [
    "P141", // IUCN
    "P181",
  ],
} satisfies Record<string, readonly string[]>;
