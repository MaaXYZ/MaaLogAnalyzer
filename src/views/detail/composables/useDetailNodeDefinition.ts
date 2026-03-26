import { computed, type Ref } from 'vue'

interface UseDetailNodeDefinitionOptions {
  bridgeNodeDefinition: Ref<string | null | undefined>
}

export const useDetailNodeDefinition = (options: UseDetailNodeDefinitionOptions) => {
  const formattedBridgeNodeDefinition = computed(() => {
    const raw = options.bridgeNodeDefinition.value
    if (!raw) return ''
    const trimmed = raw.trim()
    if (!trimmed) return ''
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      return trimmed
    }
  })

  return {
    formattedBridgeNodeDefinition,
  }
}
