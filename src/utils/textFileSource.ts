export interface LoadedTextFileSource {
  path: string
  name: string
  content: string
  loadContent?: never
}

export interface DeferredTextFileSource {
  path: string
  name: string
  content?: never
  loadContent: () => Promise<string>
}

export type TextFileSource = LoadedTextFileSource | DeferredTextFileSource

export const getTextFileContentLoader = (source: TextFileSource): (() => Promise<string>) => {
  if ('loadContent' in source && source.loadContent) return source.loadContent
  return async () => source.content
}
