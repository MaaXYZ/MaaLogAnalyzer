import type { RealtimeEventItem } from './types'

interface ParseRealtimeEventsOptions {
  rawEvents: unknown[]
  asRecord: (value: unknown) => Record<string, unknown> | null
  toFiniteNumber: (value: unknown, fallback: number) => number
}

export const parseRealtimeEvents = (
  options: ParseRealtimeEventsOptions,
): RealtimeEventItem[] => {
  const events: RealtimeEventItem[] = []
  for (const rawEvent of options.rawEvents) {
    const eventRecord = options.asRecord(rawEvent)
    if (!eventRecord) continue
    if (typeof eventRecord.seq !== 'number' || !Number.isFinite(eventRecord.seq)) continue
    const details = options.asRecord(eventRecord.details) ?? {}
    events.push({
      seq: eventRecord.seq,
      at: options.toFiniteNumber(eventRecord.at, Date.now()),
      msg: typeof eventRecord.msg === 'string' ? eventRecord.msg : '',
      details,
    })
  }
  return events
}
