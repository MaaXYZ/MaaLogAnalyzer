/**
 * 识别详情（`RecognitionDetail.detail`）体积裁剪。
 *
 * MaaFramework 的识别结果会把调试信息原样带回来，典型如 ColorMatch 的
 * `detail.all` / `detail.filtered`——会把整块 ROI 里每一个匹配到的像素框都列出来，
 * 单份可达上万条。而同一个识别结果又会被投影进 `node_flow` 的多个条目，于是整棵
 * 任务树里会累积出几十万个小对象，直接把内存和跨线程传输撑爆。
 *
 * 详情面板实际只用到 `all` / `filtered` 的**数量**和 `best` 的摘要（见
 * `src/views/detail/components/detailRows.ts`），并不展示候选明细，所以这里把候选数组
 * 截断到前 N 条，并把原始数量记录到同级的 `allTotal` / `filteredTotal`，UI 据此显示正确计数。
 * 默认关闭，由调用方（Worker 解析路径）显式开启，保持解析器既有输出不变。
 */

export const SLIM_CANDIDATE_LIMIT = 8

const CANDIDATE_KEYS = ['all', 'filtered'] as const

const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  value !== null && typeof value === 'object'

/** 就地把一棵 `RecognitionDetail.detail` 里的候选数组截断到 `cap` 条，并记录原始数量。 */
export const slimRecognitionDetailValue = (
  detail: unknown,
  cap = SLIM_CANDIDATE_LIMIT,
  seen = new WeakSet<object>(),
): void => {
  if (!isObject(detail) || seen.has(detail)) return
  seen.add(detail)

  if (Array.isArray(detail)) {
    for (const item of detail) slimRecognitionDetailValue(item, cap, seen)
    return
  }

  for (const key of Object.keys(detail)) {
    const child = detail[key]
    if ((CANDIDATE_KEYS as readonly string[]).includes(key) && Array.isArray(child)) {
      if (child.length > cap) {
        detail[`${key}Total`] = child.length
        const kept = child.slice(0, cap)
        detail[key] = kept
        for (const item of kept) slimRecognitionDetailValue(item, cap, seen)
      } else {
        for (const item of child) slimRecognitionDetailValue(item, cap, seen)
      }
    } else {
      slimRecognitionDetailValue(child, cap, seen)
    }
  }
}

/**
 * 遍历整棵任务树，对每个 `reco_details.detail` 执行裁剪。原地修改，必须在冻结之前调用。
 */
export const slimTaskRecognitionDetails = <T>(
  tasks: readonly T[],
  cap = SLIM_CANDIDATE_LIMIT,
): void => {
  const seen = new WeakSet<object>()
  const detailSeen = new WeakSet<object>()

  const visit = (value: unknown): void => {
    if (!isObject(value) || seen.has(value)) return
    seen.add(value)

    if (!Array.isArray(value)) {
      const reco = value.reco_details
      if (isObject(reco) && isObject(reco.detail)) {
        slimRecognitionDetailValue(reco.detail, cap, detailSeen)
      }
    }

    for (const key of Reflect.ownKeys(value)) visit(value[key])
  }

  for (const task of tasks) visit(task)
}
