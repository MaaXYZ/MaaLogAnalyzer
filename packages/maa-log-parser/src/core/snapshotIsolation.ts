const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  value !== null && typeof value === 'object'

export const cloneSnapshotData = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
  if (!isObject(value)) return value

  const existing = seen.get(value)
  if (existing !== undefined) return existing as T

  if (Array.isArray(value)) {
    const result: unknown[] = []
    seen.set(value, result)
    for (const item of value) result.push(cloneSnapshotData(item, seen))
    return result as T
  }

  const result = Object.create(Object.getPrototypeOf(value)) as Record<PropertyKey, unknown>
  seen.set(value, result)
  for (const key of Reflect.ownKeys(value)) {
    result[key] = cloneSnapshotData(value[key], seen)
  }
  return result as T
}

export const freezeSnapshotData = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (!isObject(value) || seen.has(value)) return value
  seen.add(value)

  for (const key of Reflect.ownKeys(value)) {
    freezeSnapshotData(value[key], seen)
  }
  return Object.freeze(value)
}
