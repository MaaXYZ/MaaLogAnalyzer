import * as path from 'node:path'
import { TextDecoder } from 'node:util'

export type ExternalAnalysisRoute = 'analyze-file' | 'analyze-folder'

export interface ExternalUriInput {
  path: string
  query?: string
  fragment?: string
}

export interface ExternalAnalysisRequest {
  route: ExternalAnalysisRoute
  targetPath: string
  isUnc: boolean
}

export type ExternalUriParseResult =
  { ok: true; request: ExternalAnalysisRequest } | { ok: false; kind: 'unrelated' | 'invalid' }

export type ExternalPathKind = 'file' | 'folder' | 'other'

export interface ExternalUriGateDependencies {
  confirm: (request: ExternalAnalysisRequest) => Promise<boolean>
  inspectPath: (request: ExternalAnalysisRequest) => Promise<ExternalPathKind>
  open: (request: ExternalAnalysisRequest) => Promise<void>
}

export type ExternalUriGateResult =
  | { status: 'unrelated' | 'invalid' | 'cancelled' }
  | {
      status: 'type-mismatch'
      request: ExternalAnalysisRequest
      actualKind: ExternalPathKind
    }
  | { status: 'opened'; request: ExternalAnalysisRequest }

const MAX_ENCODED_PATH_LENGTH = 64 * 1024
const SUPPORTED_FILE_EXTENSION_RE = /\.(?:log|jsonl|txt|zip)$/i
const STRICT_BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const UNSAFE_PATH_TEXT_RE =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/u
const WINDOWS_NAMESPACE_PATH_RE = /^(?:[\\/]{2}[?.]{1,2}[\\/]|[\\/]\?\?[\\/])/u
const WINDOWS_RESERVED_COMPONENT_RE = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])$/i

const decodeCanonicalBase64Path = (encoded: string): string | null => {
  if (
    encoded.length === 0 ||
    encoded.length > MAX_ENCODED_PATH_LENGTH ||
    encoded.length % 4 !== 0 ||
    !STRICT_BASE64_RE.test(encoded)
  ) {
    return null
  }

  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) return null

  try {
    // TextDecoder strips one leading UTF-8 BOM by default. The Windows context-menu
    // helper currently emits that BOM through ADODB.Stream.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

const isWindowsUncPath = (targetPath: string): boolean => {
  if (!/^[\\/]{2}/u.test(targetPath)) return false
  const components = targetPath.slice(2).split(/[\\/]+/u)
  return components.length >= 2 && components[0].length > 0 && components[1].length > 0
}

const hasUnsafeWindowsComponent = (targetPath: string): boolean => {
  for (const rawComponent of targetPath.split(/[\\/]+/u)) {
    if (!rawComponent || /^[A-Za-z]:$/u.test(rawComponent)) continue
    if (rawComponent === '.' || rawComponent === '..' || /[. ]$/u.test(rawComponent)) {
      return true
    }
    const withoutTrailingDotsOrSpaces = rawComponent.replace(/[. ]+$/u, '')
    const deviceName = withoutTrailingDotsOrSpaces.split('.', 1)[0]
    if (WINDOWS_RESERVED_COMPONENT_RE.test(deviceName)) return true
  }
  return false
}

const hasPosixPathAlias = (targetPath: string): boolean =>
  targetPath.split('/').some((component) => component === '.' || component === '..')

const validateTargetPath = (
  targetPath: string,
  route: ExternalAnalysisRoute,
  platform: NodeJS.Platform,
): { isUnc: boolean } | null => {
  if (!targetPath || UNSAFE_PATH_TEXT_RE.test(targetPath)) return null

  let isUnc = false
  if (platform === 'win32') {
    if (WINDOWS_NAMESPACE_PATH_RE.test(targetPath)) return null

    isUnc = isWindowsUncPath(targetPath)
    const isDriveAbsolute = /^[A-Za-z]:[\\/]/u.test(targetPath)
    if (!isDriveAbsolute && !isUnc) return null
    if (hasUnsafeWindowsComponent(targetPath)) return null

    const pathWithoutDrive = isDriveAbsolute ? targetPath.slice(2) : targetPath
    if (pathWithoutDrive.includes(':')) return null
  } else {
    if (!path.posix.isAbsolute(targetPath) || hasPosixPathAlias(targetPath)) return null
  }

  if (route === 'analyze-file' && !SUPPORTED_FILE_EXTENSION_RE.test(targetPath)) {
    return null
  }

  return { isUnc }
}

export const parseExternalAnalysisUri = (
  uri: ExternalUriInput,
  platform: NodeJS.Platform = process.platform,
): ExternalUriParseResult => {
  const routePrefix = uri.path.startsWith('/open/')
  const match = uri.path.match(/^\/open\/(analyze-file|analyze-folder)\/(.+)$/u)

  if (!match) {
    return { ok: false, kind: routePrefix ? 'invalid' : 'unrelated' }
  }
  if (uri.query || uri.fragment) return { ok: false, kind: 'invalid' }

  const route = match[1] as ExternalAnalysisRoute
  const targetPath = decodeCanonicalBase64Path(match[2])
  if (targetPath == null) return { ok: false, kind: 'invalid' }

  const validation = validateTargetPath(targetPath, route, platform)
  if (!validation) return { ok: false, kind: 'invalid' }

  return {
    ok: true,
    request: {
      route,
      targetPath,
      isUnc: validation.isUnc,
    },
  }
}

export const gateExternalAnalysisUri = async (
  uri: ExternalUriInput,
  dependencies: ExternalUriGateDependencies,
  platform: NodeJS.Platform = process.platform,
): Promise<ExternalUriGateResult> => {
  const parsed = parseExternalAnalysisUri(uri, platform)
  if (!parsed.ok) return { status: parsed.kind }

  const approved = await dependencies.confirm(parsed.request)
  if (!approved) return { status: 'cancelled' }

  const actualKind = await dependencies.inspectPath(parsed.request)
  const expectedKind: ExternalPathKind = parsed.request.route === 'analyze-file' ? 'file' : 'folder'
  if (actualKind !== expectedKind) {
    return {
      status: 'type-mismatch',
      request: parsed.request,
      actualKind,
    }
  }

  await dependencies.open(parsed.request)
  return { status: 'opened', request: parsed.request }
}
