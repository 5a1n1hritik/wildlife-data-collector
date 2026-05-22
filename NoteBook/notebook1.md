## to haan, Wikipedia extractor banta hai

lekin **ek nahi, teen parts me**

### 🧱 FINAL ARCHITECTURE (yaad rakhna)

### Layer W1: Wikipedia RAW Collector

iska kaam sirf itna:

* page.revisions se raw wikitext laana
* page.extract se intro laana
* pageimages se hero image laana
* **koi cleaning nahi**
* **koi formatting nahi**
* **koi filtering nahi**

output:

```ts
wiki_raw = {
  title,
  pageid,
  intro_raw,
  wikitext_raw,
  hero_image,
  fetched_at
}
```

tumhara current `fetchHybridData` ka aadha hissa yahin belong karta hai.

---

### Layer W2: Wikipedia Semantic Extractor  ← **ye tum ab bana rahe ho**

yeh actual extractor hai.

iska kaam:

* raw wikitext input lena
* **sirf mammals ke kaam ke sections nikaalna**
* un sections ke andar:

  * text
  * tables (markdown me)
  * gallery images
* har cheez ke saath metadata lagana

output example:

```ts
wiki_semantic = {
  sections: [
    {
      key: "habitat",
      title: "Habitat & Distribution",
      text_markdown,
      tables: [],
      images: []
    }
  ],
  media: {
    all_images: [],
    male: null,
    female: null
  }
}
```

👉 tumhara `parseGoldmineSections`, `extractGalleryImages`,
`convertWikiTableToMarkdown`, `findGenderImages`
**sab yahin belong karte hain**

bas inko ek **class / module** me band karo.

---

### Layer W3: Wikipedia Normalizer (baad me)

ye future ka headache hai.

* markdown trimming
* section ordering
* image limits
* frontend-specific shaping

abhi ispe sochna bhi mana hai.

---

## ab seedha answer: **ab next kya karna hai**

### STEP 1 ❌ skip (tum bol chuke ho)

RAW Wikidata fix ho raha hai.

### STEP 2 ✅ current focus

**Wikipedia Semantic Extractor ko isolate karo**

concretely:

* `fetchHybridData` tod do
* `WikipediaExtractor` naam ka module banao
* uska input ho:

  * `intro_raw`
  * `wikitext_raw`
* output ho:

  * structured sections + media

abhi database, frontend, caching bhool jao.

---

## ek uncomfortable truth (sun lo)

tumhara regex-based parsing:

* 70% mammals ke liye kaam karega
* 30% me fail hoga

ye acceptable hai.

Wikipedia **formal grammar follow nahi karta**.
best effort hi industry standard hai.

---

## final verdict

haan
**Wikipedia extractor banta hai**

aur:

* tum already aadha bana chuke ho
* bas ab use engineer ki tarah todna aur layer me rakhna hai
* frontend ka sochna band karo jab tak data stable na ho

ye project ab toy nahi raha.
ye pipeline ban raha hai.
