import {
  useAiInputPanelBindings,
  type UseAiInputPanelBindingsOptions,
} from './useAiInputPanelBindings'
import {
  useAiOutputPanelBindings,
  type UseAiOutputPanelBindingsOptions,
} from './useAiOutputPanelBindings'

export type UseAiPanelBindingsOptions =
  & UseAiInputPanelBindingsOptions
  & UseAiOutputPanelBindingsOptions

export const useAiPanelBindings = (options: UseAiPanelBindingsOptions) => {
  const { inputPanelProps, inputPanelHandlers } = useAiInputPanelBindings(options)
  const { outputPanelProps, outputPanelHandlers } = useAiOutputPanelBindings(options)

  return {
    inputPanelProps,
    inputPanelHandlers,
    outputPanelProps,
    outputPanelHandlers,
  }
}
