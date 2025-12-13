export interface Species {
  id: string
  name: string
  scientificName?: string | null
  description: string
  image?: string | null
  source: {
    wikipedia: string
  }
  lastUpdated: string
}
