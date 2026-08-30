import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createApplyLoadedTargetAction } from '../applyAction'
import { applyLoadedTargetToState } from '../applyTarget'
import { ensureLoadedSourceReady } from '../loadedReady'
import { createSourceSelectionActions } from '../selectionActions'
import { setupLoadedTargetModeSync } from '../watchModeSync'
import { setupLoadedTargetTargetsSync } from '../watchTargetsSync'
import type { LoadedSourceActionOptions, LoadedSourceSyncOptions } from '../optionTypes'
import type { LoadedSearchTarget } from '../../types'
import type { SourceMode } from '../types'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const createTarget = (id: string, content = `${id} content`): LoadedSearchTarget => ({
  id,
  label: `${id} label`,
  fileName: `${id}.log`,
  content,
})

const createActionOptions = (targets: LoadedSearchTarget[]) => {
  const sourceMode = ref<SourceMode>('loaded')
  const selectedLoadedTargetId = ref(targets[0]?.id ?? '')
  const sourceLoadGeneration = ref(0)
  const sourceIntentGeneration = ref(0)
  const isLoadingFile = ref(false)
  const resetSearchResultsOnly = vi.fn()
  const selection = createSourceSelectionActions({
    sourceMode,
    selectedLoadedTargetId,
    sourceLoadGeneration,
    sourceIntentGeneration,
    isLoadingFile,
    resetSearchResultsOnly,
  })
  const options: LoadedSourceActionOptions = {
    loadedTargets: ref<LoadedSearchTarget[] | undefined>(targets),
    loadedDefaultTargetId: ref<string | undefined>(targets[0]?.id),
    hasDeferredLoadedTargets: ref<boolean | undefined>(false),
    ensureLoadedTargets: ref<(() => Promise<void>) | undefined>(undefined),
    fileName: ref(''),
    fileContent: ref(''),
    fileHandle: ref<File | null>(null),
    fileSizeInMB: ref(0),
    isLargeFile: ref(false),
    totalLines: ref(0),
    showFileContent: ref(false),
    contentKey: ref(0),
    isLoadingFile,
    sourceLoadGeneration,
    sourceIntentGeneration,
    resetSearchResultsOnly,
    sourceMode,
    selectedLoadedTargetId,
    prepareLoadedTarget: selection.prepareLoadedTarget,
  }
  return { options, selection }
}

const createDeferredApplyTarget = (gates: Map<string, Deferred<void>>) =>
  vi.fn(
    async (
      state: Parameters<typeof applyLoadedTargetToState>[0],
      target: LoadedSearchTarget | undefined,
    ) => {
      if (!target) return
      state.isLoadingFile.value = true
      await gates.get(`${target.id}:${target.content}`)?.promise
      const shouldApply = state.shouldApply?.() ?? true
      if (shouldApply) {
        state.fileName.value = target.fileName
        state.fileContent.value = target.content
        state.isLoadingFile.value = false
      }
    },
  )

describe('loaded source generations', () => {
  it('does not let loaded target A overwrite target B or clear its loading state', async () => {
    const targetA = createTarget('a')
    const targetB = createTarget('b')
    const { options, selection } = createActionOptions([targetA, targetB])
    const gateA = createDeferred<void>()
    const gateB = createDeferred<void>()
    const applyTarget = createDeferredApplyTarget(
      new Map([
        ['a:a content', gateA],
        ['b:b content', gateB],
      ]),
    )
    const applyLoadedTarget = createApplyLoadedTargetAction(options, applyTarget)

    const loadA = applyLoadedTarget(targetA)
    selection.selectLoadedTarget('b')
    const loadB = applyLoadedTarget(targetB)

    gateA.resolve()
    await loadA

    expect(options.fileName.value).toBe('')
    expect(options.isLoadingFile.value).toBe(true)

    gateB.resolve()
    await loadB

    expect(options.fileName.value).toBe('b.log')
    expect(options.fileContent.value).toBe('b content')
    expect(options.isLoadingFile.value).toBe(false)
  })

  it('does not reuse an in-flight load when the same target id has new content', async () => {
    const oldTarget = createTarget('same', 'old content')
    const newTarget = createTarget('same', 'new content')
    const { options } = createActionOptions([oldTarget])
    const oldGate = createDeferred<void>()
    const newGate = createDeferred<void>()
    const applyTarget = createDeferredApplyTarget(
      new Map([
        ['same:old content', oldGate],
        ['same:new content', newGate],
      ]),
    )
    const applyLoadedTarget = createApplyLoadedTargetAction(options, applyTarget)

    const oldLoad = applyLoadedTarget(oldTarget)
    const newLoad = applyLoadedTarget(newTarget)

    oldGate.resolve()
    await oldLoad
    newGate.resolve()
    await newLoad

    expect(applyTarget).toHaveBeenCalledTimes(2)
    expect(options.fileContent.value).toBe('new content')
  })

  it('shares one in-flight load for an unchanged target', async () => {
    const target = createTarget('same')
    const { options } = createActionOptions([target])
    const gate = createDeferred<void>()
    const applyTarget = createDeferredApplyTarget(new Map([['same:same content', gate]]))
    const applyLoadedTarget = createApplyLoadedTargetAction(options, applyTarget)

    const first = applyLoadedTarget(target)
    const second = applyLoadedTarget(target)
    gate.resolve()
    await Promise.all([first, second])

    expect(applyTarget).toHaveBeenCalledTimes(1)
    expect(options.fileContent.value).toBe('same content')
  })

  it('reloads a same-name target when its content differs', async () => {
    const target = createTarget('same', 'new content')
    const { options, selection } = createActionOptions([target])
    options.fileName.value = target.fileName
    options.fileContent.value = 'old content'
    const applyLoadedTarget = vi.fn(async () => {
      options.fileContent.value = target.content
    })

    const ready = await ensureLoadedSourceReady({
      sourceMode: options.sourceMode,
      selectedLoadedTargetId: options.selectedLoadedTargetId,
      loadedTargets: options.loadedTargets,
      loadedDefaultTargetId: options.loadedDefaultTargetId,
      fileName: options.fileName,
      fileContent: options.fileContent,
      fileHandle: options.fileHandle,
      selectLoadedTarget: selection.prepareLoadedTarget,
      applyLoadedTarget,
    })

    expect(applyLoadedTarget).toHaveBeenCalledWith(target)
    expect(ready).toBe(true)
  })

  it('does not resume deferred loaded mode after the user switches back to manual', async () => {
    const target = createTarget('loaded')
    const ensureDeferred = createDeferred<void>()
    const sourceMode = ref<SourceMode>('manual')
    const sourceLoadGeneration = ref(0)
    const selectedLoadedTargetId = ref('')
    const loadedTargets = ref<LoadedSearchTarget[] | undefined>(undefined)
    const applyLoadedTarget = vi.fn(async () => {})
    const prepareSourceMode = vi.fn((mode: SourceMode) => {
      sourceLoadGeneration.value += 1
      sourceMode.value = mode
    })
    const prepareLoadedTarget = vi.fn((id: string) => {
      sourceLoadGeneration.value += 1
      selectedLoadedTargetId.value = id
    })
    const options: LoadedSourceSyncOptions = {
      loadedTargets,
      loadedDefaultTargetId: ref<string | undefined>(target.id),
      hasDeferredLoadedTargets: ref<boolean | undefined>(true),
      ensureLoadedTargets: ref<(() => Promise<void>) | undefined>(async () => {
        await ensureDeferred.promise
        loadedTargets.value = [target]
      }),
      fileName: ref(''),
      sourceLoadGeneration,
      sourceMode,
      selectedLoadedTargetId,
      prepareSourceMode,
      prepareLoadedTarget,
      applyLoadedTarget,
    }
    const scope = effectScope()
    scope.run(() => setupLoadedTargetModeSync(options))

    sourceMode.value = 'loaded'
    await nextTick()
    sourceLoadGeneration.value += 1
    sourceMode.value = 'manual'
    ensureDeferred.resolve()
    await nextTick()
    await nextTick()

    expect(prepareLoadedTarget).not.toHaveBeenCalled()
    expect(applyLoadedTarget).not.toHaveBeenCalled()
    expect(sourceMode.value).toBe('manual')
    scope.stop()
  })

  it('does not let loaded target updates replace an active manual file', async () => {
    const target = createTarget('loaded')
    const sourceMode = ref<SourceMode>('manual')
    const options: LoadedSourceSyncOptions = {
      loadedTargets: ref<LoadedSearchTarget[] | undefined>([]),
      loadedDefaultTargetId: ref<string | undefined>(target.id),
      hasDeferredLoadedTargets: ref<boolean | undefined>(false),
      ensureLoadedTargets: ref<(() => Promise<void>) | undefined>(undefined),
      fileName: ref('manual.log'),
      sourceLoadGeneration: ref(0),
      sourceMode,
      selectedLoadedTargetId: ref(''),
      prepareSourceMode: vi.fn(),
      prepareLoadedTarget: vi.fn(),
      applyLoadedTarget: vi.fn(async () => {}),
    }
    const scope = effectScope()
    scope.run(() => setupLoadedTargetTargetsSync(options))

    options.loadedTargets.value = [target]
    await nextTick()

    expect(options.prepareSourceMode).not.toHaveBeenCalled()
    expect(options.prepareLoadedTarget).not.toHaveBeenCalled()
    expect(options.applyLoadedTarget).not.toHaveBeenCalled()
    expect(sourceMode.value).toBe('manual')
    scope.stop()
  })
})
