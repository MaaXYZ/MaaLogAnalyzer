import knowledgeJson from './maa-domain-knowledge.v1.json'

export interface KnowledgeSource {
  id: string
  note?: string
}

export interface KnowledgeEvidence {
  sourceId: string
  loc: string
}

export interface KnowledgeCard {
  id: string
  topic: string
  title: string
  rule: string
  details: string[]
  keywords: string[]
  evidence: KnowledgeEvidence[]
}

export interface KnowledgePack {
  id: string
  version: string
  generatedAt: string
  language: string
  sources: KnowledgeSource[]
  cards: KnowledgeCard[]
}

const pack = knowledgeJson as KnowledgePack

const normalize = (value: string) => value.trim().toLowerCase()

export const maaKnowledgePack: KnowledgePack = pack

export const getKnowledgeCard = (id: string): KnowledgeCard | undefined => {
  const target = normalize(id)
  return maaKnowledgePack.cards.find(card => normalize(card.id) === target)
}

export const getKnowledgeByTopic = (topic: string): KnowledgeCard[] => {
  const target = normalize(topic)
  return maaKnowledgePack.cards.filter(card => normalize(card.topic) === target)
}

export const searchKnowledge = (query: string, limit = 12): KnowledgeCard[] => {
  const q = normalize(query)
  if (!q) return []

  const scored = maaKnowledgePack.cards
    .map((card) => {
      const id = normalize(card.id)
      const topic = normalize(card.topic)
      const title = normalize(card.title)
      const rule = normalize(card.rule)
      const details = card.details.map(normalize)
      const keywords = card.keywords.map(normalize)

      let score = 0
      if (id.includes(q)) score += 6
      if (topic.includes(q)) score += 5
      if (title.includes(q)) score += 5
      if (keywords.some(k => k.includes(q))) score += 4
      if (rule.includes(q)) score += 3
      if (details.some(d => d.includes(q))) score += 2

      return { card, score }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, Math.max(1, limit)).map(item => item.card)
}

export const getKnowledgeSummary = (): { cardCount: number; topicCount: number; topics: string[] } => {
  const topics = Array.from(new Set(maaKnowledgePack.cards.map(card => card.topic))).sort()
  return {
    cardCount: maaKnowledgePack.cards.length,
    topicCount: topics.length,
    topics,
  }
}
