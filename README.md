### 📋 Essential Wikidata Properties for Mammals

| Property | Name | Importance |
| --- | --- | --- |
| **P2067** | **Mass (Weight)** | Sabse zaruri. Isme value ke saath unit ID (QID) bhi hoti hai (e.g., kg ya g). |
| **P2257** | **Lifespan** | Aksar "days" mein data milta hai, tumhe isse  se divide karke years nikaalne honge. |
| **P2048** | **Height** | Shoulder height ke liye use hota hai. |
| **P2049** | **Length** | Head-to-body length ke liye. |
| **P1843** | **Taxon Common Name** | Scientific name ke saath verify karne ke liye ki hum sahi janwar ka data le rahe hain. |
| **P171** | **Parent Taxon** | Isse tumhe Genus ya Family mil jati hai (Verification ke liye best hai). |
| **P141** | **IUCN Status** | Conservation status (LC, VU, EN, etc.) ka QID milta hai. |
| **P18** | **Image** | Main image ka file name. |

---

### 🛠️ Professional Logic: Inhe Fetch Kaise Karein?

Jab tum Layer 1 (Wikidata) likhoge, toh dhyaan rakhna ki Wikidata hamesha "Amount" aur "Unit" deta hai. Unit ko pehchanna zaruri hai:

**Example Logic (Snippet):**

```typescript
const claim = claims.P2067?.[0]?.mainsnak?.datavalue?.value;
if (claim) {
  let weight = parseFloat(claim.amount);
  const unitQID = claim.unit.split('/').pop(); // Unit ID nikalne ke liye

  if (unitQID === "Q41803") weight = weight / 1000; // Grams to KG
  if (unitQID === "Q11570") weight = weight; // Already KG
  
  console.log(`Weight: ${weight} kg`);
}

```

### 💡 Pro-Tip for your New Start:

Agar tum search API (`wbsearchentities`) ke bajaye **SPARQL Query** use karoge, toh tum ek saath 50 mammals ka data ek hi request mein nikaal sakte ho. Ye tumhari script ko super-fast bana dega.

---

**Next Step:**
Kya tum chahte ho main tumhe ek **JSON Mapping** bana kar doon jo in saari QIDs (Units aur Status) ko readable text mein convert kar de? Jaise `Q211005` -> `Least Concern`.

---

## lifestyle, habitat, aur biological identity ki `Complete Metadata`.

Wikidata ek samundar hai. Mammals (Mammalia) ke liye ye rahi woh **Master List** jo tumhari script ko Wikipedia se bhi zyada taqatwar bana degi. Maine ise categories mein baant diya hai:

### 1. Biological & Taxonomic (Identification)

Inse tumhara data verify hota hai ki koi galat entry toh nahi hai.

| Property | Name | Description |
| --- | --- | --- |
| **P225** | **Taxon Name** | Full scientific name (e.g., *Panthera leo*). |
| **P105** | **Taxon Rank** | Batata hai ki ye Species hai, Subspecies hai ya Genus. |
| **P171** | **Parent Taxon** | Isse puri family tree connect hoti hai. |
| **P1843** | **Common Name** | Alag-alag languages mein naam. |
| **P141** | **IUCN Status** | Conservation status (QID values: Q211005, etc). |

---

### 2. Physical Traits (The "Specs")

Sirf weight se kaam nahi chalega, ye properties bhi uthao:

| Property | Name | Description |
| --- | --- | --- |
| **P2067** | **Mass (Weight)** | Weight (Units: kg, g, lb). |
| **P2048** | **Height** | Shoulder height (mostly in cm/m). |
| **P2049** | **Length** | Body length (nose to tail). |
| **P2574** | **Gestation Period** | Kitne din tak baccha pet mein rehta hai (Pregnancy time). |
| **P2257** | **Lifespan** | Maximum age. |
| **P1571** | **Incubation Period** | (Rare for mammals, but some lay eggs like Platypus). |
| **P1083** | **Maximum Capacity** | Kabhi-kabhi weight ki max limit yahan hoti hai. |

---

### 3. Ecology & Lifestyle (Behavior)

Ye data tumhare "Description" ko automate kar dega:

| Property | Name | Description |
| --- | --- | --- |
| **P2974** | **Habitat** | Kahan rehta hai (Forest, Savannah, Desert). |
| **P1034** | **Main Food Source** | Kya khata hai (Prey objects). |
| **P3018** | **Natural Reservoir** | Kaunsi bimariyan phailata hai ya carry karta hai. |
| **P3811** | **Trophic Level** | Herbivore (Q121432), Carnivore (Q105230), ya Omnivore. |
| **P1294** | **Social Group** | Jhund mein rehta hai ya akela (Solitary vs Social). |
| **P522** | **Type of Activity** | Diurnal (din mein jaagne wala) ya Nocturnal (raat wala). |

---

### 4. Geographical Data (Range)

Isse tum map bana sakte ho:

| Property | Name | Description |
| --- | --- | --- |
| **P181** | **Taxon Range Map** | Area map ki image ka link. |
| **P301** | **Category's Main Topic** | Wikipedia ke aur links nikalne ke liye. |
| **P424** | **Wikimedia Language Code** | Native names fetch karne ke liye. |

---

### 🛠️ Pro-Coder Tip: SPARQL Query Use Karo

Agar tum ek-ek QID fetch karoge toh script slow ho jayegi. Wikidata ka **SPARQL Endpoint** use karo. Ek single query se tum 100 mammals ka upar likha saara data **ek second** mein nikaal sakte ho.

## Source of Truth for all  P-numbers.

### 1. P-Numbers ki Master List kahan milegi?

Tumhe kisi AI ki zarurat nahi hai, tum seedha **Wikidata** ke taxonomy portal par ja sakte ho. Ye do links apne paas save kar lo, yahan duniya bhar ke biological P-numbers mil jayenge:

* **Wikidata:WikiProject Taxonomy/Properties:** Yahan har wo property hai jo kisi bhi species (mammals, plants, insects) ke liye use hoti hai.
* **Wikidata:List of Properties/Biology:** Ye complete biological properties ki list hai.

### 2. Complete P-Numbers List for Mammals (The Aggressive List)

Tumhe complete chahiye thi, toh ye rahi woh exhaustive list jo ek mammal ke data ko "complete" banati hai. Iske bahar shayad hi kuch bacha ho:

#### **Physical & Biological Specs**

* **P2067:** Mass (Weight)
* **P2257:** Lifespan (Longevity)
* **P2048:** Height (Shoulder height)
* **P2049:** Length (Body/Tail length)
* **P2574:** Gestation period (Pregnancy duration)
* **P1571:** Incubation period
* **P3063:** Brain size / Cranial capacity
* **P2112:** Metabolic rate
* **P2115:** Body temperature

#### **Reproduction & Life Cycle**

* **P3438:** Litter size (Number of offspring)
* **P3439:** Weaning age (Age when young stop nursing)
* **P3440:** Sexual maturity age
* **P3441:** Interbirth interval (Gap between births)

#### **Ecology & Behavior**

* **P2974:** Habitat (Specific environment)
* **P1034:** Main food source (Prey/Plants)
* **P3811:** Trophic level (Carnivore/Herbivore/Omnivore)
* **P1294:** Social group (Solitary/Pack/Herd)
* **P522:** Type of activity (Nocturnal/Diurnal/Crepuscular)
* **P2093:** Author citation (Who discovered it)
* **P3151:** iNaturalist taxon ID (For spotting/maps)

#### **Conservation & Geography**

* **P141:** IUCN conservation status
* **P181:** Taxon range map (Image of where they live)
* **P3005:** Valid in period (Geological time/Era)
* **P9448:** Population trend (Decreasing/Stable/Increasing)

### 3. Ek Pro-Tip jo tumhara kaam asaan kar degi

Agar tum kisi mammal ke Wikidata page (jaise Panthera leo) par jaoge aur upar **"Statements"** section dekhoge, toh wahan left side mein jo naam hote hain, un par click karke tum uska **P-number** (URL mein) dekh sakte ho.

Ab tumhare paas source bhi hai aur list bhi. Isse zyada P-numbers biology mein exist nahi karte jo standard databases mein use hote hon.

### 4. Importent Point

Bas ek baat yaad rakhna, jab tum in P-numbers ko use karoge, toh Wikidata tumhe hamesha "Raw Values" dega. Kaam asaan karne ke liye ye checklist dimaag mein rakhna:

1. **Unit IDs:** Wikidata mein weight sirf number nahi hota, saath mein unit ki ID hoti hai.
* **Q11570** = Kilogram
* **Q41803** = Gram


2. **Mapping:** In P-numbers ko apne script mein ek constant object mein daal dena, taaki baar-baar property numbers yaad na karne padein.
3. **Language:** Agar English data chahiye, toh API call mein `languages=en` zaroor lagana, varna kabhi-kabhi local language names aa jate hain.

Dekho, jab tum Wikipedia se data nikaalte ho, toh wahan likha hota hai `40 kg`. Lekin **Wikidata** ek database hai, wo insaano ki tarah nahi, computer ki tarah baat karta hai.

Jab tum Wikidata se `P2067` (Weight) maangoge, toh wo tumhe ek simple string nahi dega, balki ek **JSON object** dega jo aisa dikhta hai:

```json
"datavalue": {
  "value": {
    "amount": "+40",            // Ye sirf number hai
    "unit": "http://www.wikidata.org/entity/Q11570" // Ye Unit ki ID hai
  }
}

```

### Iska matlab kya hai?

1. **Amount:** Ye sirf ek number hai (jaise `40` ya `4000`).
2. **Unit (Q-ID):** Wikidata tumhe "kg" ya "gram" likh kar nahi dega. Wo tumhe ek **Q-ID** dega.
* Agar unit ke link mein aakhiri mein **Q11570** hai, toh uska matlab hai **Kilogram**.
* Agar aakhiri mein **Q41803** hai, toh uska matlab hai **Gram**.



### Tumhe kyun dhyan rakhna hai?

Maano ek mammal ka weight hai `4 kg` aur doosre ka hai `4000 g`.

* Pehle wale ke liye Wikidata bolega: `amount: 4`, `unit: Q11570` (kg)
* Doosre wale ke liye Wikidata bolega: `amount: 4000`, `unit: Q41803` (g)

Agar tumne unit check nahi ki aur sirf `amount` utha liya, toh tumhara data galat ho jayega. Tumhe script mein ek chota sa check lagana padega:
*"Agar unit Q41803 hai, toh amount ko 1000 se divide kar do taaki sab kuch KG mein aa jaye."*


### Wikidata mein data teen tarah se milta hai, aur tumhe sirf in teenon ko handle karna seekhna hai:

### 1. Measurement Types (P2067 Weight, P2048 Height, P2257 Lifespan)

Inme hamesha **Amount + Unit (QID)** milega. Inhe handle karne ke liye tumhe unit check karni hi hogi.

* **Height/Length (P2048/P2049):** Isme tumhe `Q11573` (Metre) ya `Q174728` (Centimetre) mil sakta hai.
* **Lifespan (P2257):** Isme aksar `Q11574` (Day) milta hai. Tumhe ise year mein badalne ke liye  se divide karna padega.

---

### 2. Item Types (P141 IUCN Status, P2974 Habitat, P3811 Trophic Level)

Inme koi number nahi hota, balki ek **doosri QID** hoti hai.

* Jaise IUCN Status (`P141`) maangoge toh wo "Endangered" nahi likhega, wo bolega `Q11394`.
* Iske liye tumhe apni script mein ek chota sa "Mapping Object" banana hoga:
`{ "Q11394": "Endangered", "Q211005": "Least Concern" }`

---

### 3. String / Media Types (P18 Image, P1843 Common Name)

Ye sabse simple hain. Inme hamesha **Direct Text** ya **File Name** milta hai. Isme koi unit ka chakkar nahi hota.

---

### Kya tumhe sabhi P-numbers ke liye ye karna hoga?

**Nahi, sabke liye nahi.** Sirf unke liye jo "Quantity" (Quantity Datatype) hain.
Tumhari list mein se sirf in 5-6 properties mein ye unit wala chakkar aayega:

1. Weight (`P2067`)
2. Lifespan (`P2257`)
3. Height (`P2048`)
4. Length (`P2049`)
5. Gestation period (`P2574`)

### Kal ka Solution:

Kal jab tum aoge, toh main tumhe ek chota sa **`normalizeWikidata(property)`** function likhwa dunga. Wo function khud hi check kar lega ki "Unit" kya hai aur tumhe seedha saaf-suthra data (e.g., "40 kg") return karega. Tumhe har property ke liye alag se math nahi karna padega.

Ab dimaag se ye bojh nikaal do. Ye sirf 10 line ka code hai, koi bahut bada pahaad nahi.

**Ab seedha ghar jao aur rest karo. Kal milte hain!**