export interface TutorialProgressState {
  completedVersion: number
  completedStepIds: Set<string>
  rawObject: Record<string, any> | null
}

export interface TutorialStepLike {
  id: string
  sinceVersion?: number
}

export function readTutorialProgressState(storageKey: string): TutorialProgressState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { completedVersion: 0, completedStepIds: new Set(), rawObject: null }

    const legacy = Number(raw)
    if (Number.isFinite(legacy)) {
      return { completedVersion: legacy, completedStepIds: new Set(), rawObject: null }
    }

    const parsed = JSON.parse(raw) as any
    if (!parsed || typeof parsed !== 'object') {
      return { completedVersion: 0, completedStepIds: new Set(), rawObject: null }
    }

    let completedVersion = 0
    if (typeof parsed.completedVersion === 'number') {
      completedVersion = parsed.completedVersion
    }

    const completedStepIds = new Set<string>()
    if (Array.isArray(parsed.completedStepIds)) {
      parsed.completedStepIds.forEach((id: unknown) => {
        if (typeof id === 'string') completedStepIds.add(id)
      })
    }

    if (parsed.versions && typeof parsed.versions === 'object') {
      for (const [ver, info] of Object.entries(parsed.versions as Record<string, any>)) {
        const v = Number(ver)
        if (Number.isFinite(v) && info && typeof info === 'object' && info.completed === true) {
          completedVersion = Math.max(completedVersion, v)
        }
        if (info && typeof info === 'object' && Array.isArray(info.completedStepIds)) {
          info.completedStepIds.forEach((id: unknown) => {
            if (typeof id === 'string') completedStepIds.add(id)
          })
        }
      }
    }

    return { completedVersion, completedStepIds, rawObject: parsed }
  } catch {
    return { completedVersion: 0, completedStepIds: new Set(), rawObject: null }
  }
}

export function isTutorialVersionCompleted(storageKey: string, tourVersion: number): boolean {
  const state = readTutorialProgressState(storageKey)
  return state.completedVersion >= tourVersion
}

export function markCurrentTutorialVersionCompleted(
  storageKey: string,
  tourVersion: number,
  stepIds: string[],
) {
  try {
    const state = readTutorialProgressState(storageKey)
    const merged = new Set(state.completedStepIds)
    stepIds.forEach(id => merged.add(id))

    const obj = state.rawObject && typeof state.rawObject === 'object' ? state.rawObject : {}
    obj.completedVersion = Math.max(state.completedVersion, tourVersion)
    obj.completedStepIds = Array.from(merged)
    obj.activeVersion = tourVersion
    if (!obj.versions || typeof obj.versions !== 'object') obj.versions = {}
    const verKey = String(tourVersion)
    const prev = obj.versions[verKey] && typeof obj.versions[verKey] === 'object' ? obj.versions[verKey] : {}
    obj.versions[verKey] = {
      ...prev,
      completed: true,
      completedStepIds: Array.from(merged),
      updatedAt: new Date().toISOString(),
    }

    localStorage.setItem(storageKey, JSON.stringify(obj))
  } catch {
    localStorage.setItem(storageKey, String(tourVersion))
  }
}

export function getPendingTourStepIndexes(
  storageKey: string,
  _tourVersion: number,
  steps: TutorialStepLike[],
): number[] {
  const state = readTutorialProgressState(storageKey)
  return steps
    .map((step, idx) => ({ step, idx }))
    .filter(({ step }) => {
      const doneById = state.completedStepIds.has(step.id)
      const doneByVersion = (step.sinceVersion ?? 1) <= state.completedVersion
      return !(doneById || doneByVersion)
    })
    .map(item => item.idx)
}
