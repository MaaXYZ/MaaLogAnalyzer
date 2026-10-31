/**
 * 加载失败时给用户看的文案与文件预检。
 *
 * 为什么单独抽一份：同一次「加载失败」会在三个不同层次被拦下——
 * 上传前预检（只拿得到 File 元信息）、解析完成后（只拿得到 TaskInfo[]）、
 * 压缩包解压（只拿得到解压返回值或底层异常）。三层拿到的信息完全不同，
 * 但给用户的「发生了什么 + 下一步做什么」必须是同一口径；
 * 文案散在三个调用点里一定会漂，所以统一收在这里。
 */

/**
 * 单文件上限。
 *
 * 浏览器侧要把日志同时持有原始字节 + 解码后的字符串（UTF-16 内存表示，约 2 倍体积），
 * 再加上 Worker 里的解析快照，256 MB 的日志就已经接近 1 GB 占用。
 * 超过这个量级继续放行，用户的观感是「点了没反应最后白屏」，不如直接拦住并给出替代做法。
 */
export const MAX_SINGLE_LOG_BYTES = 256 * 1024 * 1024

/** 预检只读文件开头这么多字节：够判断编码/二进制，又不会为了报错再读一遍大文件。 */
export const FILE_HEAD_SAMPLE_BYTES = 4 * 1024

/** UTF-16 文本里 ASCII 字符会留下 0x00（如 "M\0A\0A\0"），用比例把「文本但编码不对」和「二进制」分开。 */
const UTF16_NUL_RATIO = 0.15
/** 随机二进制里控制字符占比约 10%，正常日志里只有 \r \n \t。 */
const BINARY_CONTROL_RATIO = 0.05

export type SingleFileRejectionKind = 'empty' | 'oversized' | 'utf16' | 'binary'

const formatMegabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/**
 * 当前页面上已经解析出多少任务。
 *
 * 解析失败时我们不再清空旧日志（见 contentProcessor），但「已保留当前日志」这句话
 * 只有真的有旧日志时才成立，否则就是一句空话——所以要把数量记下来。
 */
let loadedTaskCount = 0

export const rememberLoadedTaskCount = (count: number): void => {
  loadedTaskCount = count
}

export const getLoadedTaskCount = (): number => loadedTaskCount

/** 失败提示尾部：先说发生了什么、下一步做什么，最后才交代旧数据还在，避免用户以为东西没了。 */
export const withPreservedLogNotice = (message: string): string =>
  loadedTaskCount > 0
    ? `${message}（本次加载已中止，当前 ${loadedTaskCount} 个任务的日志仍然保留。）`
    : message

/** 按文件开头的字节给单文件分类；只做「一眼就不可能是日志」的硬判断，宁漏勿错。 */
export const classifyFileHead = (
  head: Uint8Array,
  size: number,
): SingleFileRejectionKind | 'ok' => {
  if (size === 0) return 'empty'
  if (size > MAX_SINGLE_LOG_BYTES) return 'oversized'
  if (head.length >= 2) {
    const [first, second] = head
    // UTF-16 的 BOM：FF FE（LE）/ FE FF（BE）。decodeFileContent 只尝试 UTF-8 与 GBK 系，
    // 这类文件按文本解出来全是乱码与 \0，只会得到「0 个任务」这种无用结论。
    if ((first === 0xff && second === 0xfe) || (first === 0xfe && second === 0xff)) return 'utf16'
  }
  let nulCount = 0
  let controlCount = 0
  for (const byte of head) {
    if (byte === 0) nulCount += 1
    else if (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte === 0x7f) controlCount += 1
  }
  if (nulCount / head.length > UTF16_NUL_RATIO) return 'utf16'
  if (controlCount / head.length > BINARY_CONTROL_RATIO) return 'binary'
  return 'ok'
}

/** 空 / 过大 / UTF-16 / 二进制：这四种在读文件之前就能定性，不必让用户等一次注定失败的解析。 */
export const describeSingleFileRejection = (
  kind: SingleFileRejectionKind,
  fileName: string,
  size: number,
): string => {
  const label = `「${fileName}」`
  switch (kind) {
    case 'empty':
      return withPreservedLogNotice(
        `${label}是空文件（0 字节），没有内容可解析。请确认没有选错文件；如果确实是从 debug 目录复制的，请重新复制 maa.log。`,
      )
    case 'oversized':
      return withPreservedLogNotice(
        `${label}有 ${formatMegabytes(size)}，超过浏览器单文件上限 ${formatMegabytes(MAX_SINGLE_LOG_BYTES)}，已停止加载。请只加载 maa.log 单文件，或把日志分段后分别加载。`,
      )
    case 'utf16':
      return withPreservedLogNotice(
        `${label}不是 UTF-8 / GBK 文本：开头是 UTF-16 编码标记，或含大量 0 字节，按文本解析只会得到乱码。请在文本编辑器里「另存为 UTF-8」后重试，或直接拖入整个 debug 文件夹。`,
      )
    case 'binary':
      return withPreservedLogNotice(
        `${label}不是文本文件（检测到大量二进制字节），不能作为日志解析。请选择 debug 目录下的 maa.log / maafw.log，而不是图片或其他文件。`,
      )
  }
}

/** 压缩包本身过大：和单文件同理，但下一步不同（可以拆包、可以只解出 maa.log）。 */
export const describeOversizedArchive = (fileName: string, size: number): string =>
  withPreservedLogNotice(
    `「${fileName}」有 ${formatMegabytes(size)}，超过浏览器单文件上限 ${formatMegabytes(MAX_SINGLE_LOG_BYTES)}，已停止解压。请先解压出 maa.log 再单独加载，或分段导出日志。`,
  )

/**
 * 解析完成但一个任务都没有：先判断「这份文件是不是 MaaFramework 日志」。
 *
 * 用的是日志里必然出现的特征，而不是解析器内部结构：
 * - `!!!OnEventNotify!!!`：MaaFramework 每条事件都会打这一行；
 * - `[Px6884][Tx62931]`：MaaFramework 5.x 的进程/线程前缀。
 * 两者都没有，说明用户多半选错了文件（图片、别的程序日志、随便一段文本），
 * 此时「请检查日志文件格式是否正确」这种话帮不上任何忙。
 */
export const describeNoTaskResult = (sampleText: string, sourceLabel: string): string => {
  const label = sourceLabel ? `「${sourceLabel}」` : '这个文件'
  const looksLikeMaaLog = /!!!OnEventNotify!!!|\[Px\d+\]\[Tx\d+\]/.test(sampleText)
  return looksLikeMaaLog
    ? `${label}里没有完整的任务记录：只找到日志片段，没有可还原的流水线任务。请加载完整的 maa.log 或 maa.bak.log。`
    : `${label}不是 MaaFramework 日志（没有 OnEventNotify 事件，也没有 [Px…][Tx…] 线程前缀）。请选择 debug 目录下的 maa.log / maafw.log，或整个 debug 文件夹。`
}

/** 压缩包损坏：fflate / 7z-wasm 抛的是英文（如 invalid zip data），这里统一翻成中文并给出下一步。 */
export const describeArchiveFailure = (fileName: string): string =>
  `「${fileName}」解压失败：压缩包已损坏或不完整。请重新导出 .zip，或先手动解压再选择 debug 文件夹。`

/** 压缩包能解开但里面没有日志：说清期望的文件名与目录结构，否则用户只能反复试。 */
export const describeArchiveWithoutLogs = (): string =>
  withPreservedLogNotice(
    '压缩包里没有找到日志文件：需要包含 maa.log / maafw.log / maa.bak.*.log，并保留 debug/ 目录结构。',
  )

/** 读文件阶段就失败（权限、文件被移动、磁盘异常）：同样不把底层英文直接甩给用户。 */
export const describeFileReadFailure = (fileName: string): string =>
  `读取「${fileName}」失败，文件可能已被移动、删除或没有访问权限。请确认文件还在原位置后重新选择。`

/** 解析过程抛异常（Worker 内存不足、解码失败等）：把底层英文错误留在 console，给用户可读结论。 */
export const describeParseFailure = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error)
  const isOutOfMemory = /out of memory|allocation failed|cannot allocate|heap/i.test(raw)
  if (isOutOfMemory) {
    return '日志太大，浏览器内存不足，解析被中断。请只加载 maa.log 单文件后重试，或改用桌面版打开这份日志。'
  }
  return '解析日志时出错，文件可能已损坏。请确认它是完整的 MaaFramework 日志后重试，或换一个文件。'
}

/** 用户主动取消主日志选择：这不是错误，别再用「压缩包中未找到有效的日志文件」吓人。 */
export const CANCELLED_LOAD_MESSAGE = '已取消加载'
