import type { LoadedTextFile } from '../../../../utils/fileDialog'
import { toastInfo } from '../../../../utils/toast'
import {
  createPrimaryLogParseInputs,
  getPrimaryLogContentLoader,
  type PrimaryLogFile,
  type PrimaryLogSelectionOption,
} from '../../../../utils/logFileDiscovery'
import { isSupportedArchive, extractArchiveContents } from '../../../../utils/archiveExtractor'
import {
  CANCELLED_LOAD_MESSAGE,
  FILE_HEAD_SAMPLE_BYTES,
  MAX_SINGLE_LOG_BYTES,
  classifyFileHead,
  describeArchiveFailure,
  describeArchiveWithoutLogs,
  describeFileReadFailure,
  describeOversizedArchive,
  describeSingleFileRejection,
} from './loadErrorMessages'
import type { LogLoadingPipelineOptions } from './types'
import type { ProcessLogContentParams } from './types'
import type { DeferredTextSearchTarget, TextSearchLoadedTarget } from '../useTextSearchTargets'
import { getTextFileContentLoader } from '../../../../utils/textFileSource'
import { decodeFileContent } from '../../../../utils/textEncoding'

interface CreateUploadHandlersOptions {
  pipeline: LogLoadingPipelineOptions
  processLogContent: (params: ProcessLogContentParams) => Promise<void>
}

const createDeferredTargetsFromTextFiles = (
  content: string,
  textFiles?: LoadedTextFile[],
  primaryLogFiles?: PrimaryLogFile[],
): DeferredTextSearchTarget[] => {
  const primaryPaths = new Set((primaryLogFiles ?? []).map((file) => file.path))
  const primaryTargets: DeferredTextSearchTarget[] = (primaryLogFiles ?? []).map((file, index) => ({
    id: `loaded:primary:${index}:${file.path}`,
    label: file.path || file.name,
    fileName: file.name,
    loadContent: getPrimaryLogContentLoader(file),
  }))
  const explicitTargets: DeferredTextSearchTarget[] = (textFiles ?? [])
    .filter((file) => !primaryPaths.has(file.path))
    .map((file, index) => ({
      id: `loaded:text:${index}:${file.path}`,
      label: file.path || file.name,
      fileName: file.name,
      loadContent: getTextFileContentLoader(file),
    }))
  if (primaryTargets.length > 0) return [...primaryTargets, ...explicitTargets]
  if (explicitTargets.length > 0) return explicitTargets
  return [
    {
      id: 'loaded:content',
      label: 'loaded.log',
      fileName: 'loaded.log',
      loadContent: async () => content,
    },
  ]
}

const pickPreferredDeferredTargetId = (
  pipeline: LogLoadingPipelineOptions,
  targets: DeferredTextSearchTarget[],
): string =>
  pipeline.pickPreferredLogTargetId(
    targets.map((target): TextSearchLoadedTarget => ({
      id: target.id,
      label: target.label,
      fileName: target.fileName,
      content: '',
    })),
  )

export const createLogLoadingUploadHandlers = (options: CreateUploadHandlersOptions) => {
  const { pipeline, processLogContent } = options

  const handleFileUpload = async (
    upload: File | File[],
    selectPrimaryLogs = pipeline.selectPrimaryLogs,
  ) => {
    const files = Array.isArray(upload) ? upload : [upload]
    const file = files[0]
    if (!file) return

    if (pipeline.loading.value) {
      pipeline.onWarning('正在处理上一个文件，请稍候')
      return
    }
    pipeline.loading.value = true
    try {
      if (isSupportedArchive(file.name)) {
        if (file.size > MAX_SINGLE_LOG_BYTES) {
          pipeline.onWarning(describeOversizedArchive(file.name, file.size))
          return
        }
        pipeline.onFileLoadingStart?.()
        let fileLoadingActive = true
        try {
          // 解压层在「用户点了取消」和「压缩包里确实没有日志」两种情况下都返回 null，
          // 之前共用一句「压缩包中未找到有效的日志文件」，把主动取消说成了压缩包有问题。
          // 这里包一层记住选择器是否被取消，把两种结果分开处理。
          let selectionCancelled = false
          const trackCancelledSelection = selectPrimaryLogs
            ? async (options: PrimaryLogSelectionOption[]) => {
                const selected = await selectPrimaryLogs(options)
                if (!selected) selectionCancelled = true
                return selected
              }
            : undefined
          const result = await extractArchiveContents(files, trackCancelledSelection, undefined, {
            archiveLimits: null,
          })
          if (!result) {
            if (selectionCancelled) {
              toastInfo(CANCELLED_LOAD_MESSAGE)
              return
            }
            pipeline.onWarning(describeArchiveWithoutLogs())
            return
          }

          const deferredTargets = createDeferredTargetsFromTextFiles(
            result.content,
            result.textFiles,
            result.primaryLogFiles,
          )
          const defaultTargetId = pickPreferredDeferredTargetId(pipeline, deferredTargets)
          pipeline.onFileLoadingEnd?.()
          fileLoadingActive = false
          await processLogContent({
            content: result.content,
            parseInputs:
              result.primaryLogFiles.length > 0
                ? createPrimaryLogParseInputs(result.primaryLogFiles)
                : undefined,
            sortParseInputs: result.primaryLogFiles.length > 1,
            errorImages: result.errorImages,
            visionImages: result.visionImages,
            waitFreezesImages: result.waitFreezesImages,
            deferredTargets,
            loadedDefaultTargetId: defaultTargetId,
          })
        } finally {
          if (fileLoadingActive) {
            pipeline.onFileLoadingEnd?.()
          }
        }
        return
      }

      const fileName = file.name || 'loaded.log'
      // 单文件先做「只看开头几 KB」的预检：空文件 / 超大文件 / UTF-16 / 二进制文件
      // 注定解析不出任务，没必要让用户等一次必然失败的解析，更没必要为它清空旧日志。
      const head = new Uint8Array(await file.slice(0, FILE_HEAD_SAMPLE_BYTES).arrayBuffer())
      const rejection = classifyFileHead(head, file.size)
      if (rejection !== 'ok') {
        pipeline.onWarning(describeSingleFileRejection(rejection, fileName, file.size))
        return
      }
      await processLogContent({
        content: '',
        parseInputs: [
          {
            file,
            sourceKey: fileName,
            sourcePath: fileName,
            inputIndex: 0,
          },
        ],
        loadedDefaultTargetId: 'loaded:single',
        deferredTargets: [
          {
            id: 'loaded:single',
            label: file.name,
            fileName: file.name,
            loadContent: async () => decodeFileContent(new Uint8Array(await file.arrayBuffer())),
          },
        ],
      })
    } catch (error) {
      // 底层错误的英文原文（如 invalid zip data）只留在 console 供排障，界面给中文结论 + 下一步。
      console.error('[log-loading] 读取文件失败', error)
      pipeline.onError(
        isSupportedArchive(file.name)
          ? describeArchiveFailure(file.name)
          : describeFileReadFailure(file.name || '选择的文件'),
      )
    } finally {
      pipeline.loading.value = false
    }
  }

  const handleContentUpload = async (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: PrimaryLogFile[],
  ) => {
    if (pipeline.loading.value) {
      pipeline.onWarning('正在处理上一个文件，请稍候')
      return
    }
    pipeline.loading.value = true
    try {
      const deferredTargets = createDeferredTargetsFromTextFiles(
        content,
        textFiles,
        primaryLogFiles,
      )
      const defaultTargetId = pickPreferredDeferredTargetId(pipeline, deferredTargets)
      await processLogContent({
        content,
        parseInputs:
          primaryLogFiles && primaryLogFiles.length > 0
            ? createPrimaryLogParseInputs(primaryLogFiles)
            : undefined,
        sortParseInputs: (primaryLogFiles?.length ?? 0) > 1,
        errorImages,
        visionImages,
        waitFreezesImages,
        deferredTargets,
        loadedDefaultTargetId: defaultTargetId,
      })
    } catch (error) {
      console.error('[log-loading] 读取内容失败', error)
      pipeline.onError(describeFileReadFailure('已选择的日志'))
    } finally {
      pipeline.loading.value = false
    }
  }

  return {
    handleFileUpload,
    handleContentUpload,
  }
}
