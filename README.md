# High-Throughput Biological Data Ingestion Pipeline

A robust automation and data collection script written in Python to programmatically extract, parse, and serialize unstructured ecological data for over 14,000 avian (bird) and mammal species.

## 🚀 Features
- **Multi-Source Integration:** Fetches data seamlessly using GBIF and Wikipedia REST APIs.
- **Data Integrity:** Handles nested sub-species taxonomies and flattens data into structured relational payloads.
- **Resilience:** Implemented custom rate-limiting algorithms and network retry layers to prevent API blocks.

## 🛠️ Tech Stack
- **Language:** Python,
- **APIs:** GBIF API, Wikidata/Wikipedia API
- **Libraries:** Requests, JSON, Serialization tools