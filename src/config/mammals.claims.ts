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
    "P522",  // activity
    "P2093", 
    "P3151", 
  ],
  conservation: [
    "P141",  // IUCN
    "P181", 
  ],
} as const;
