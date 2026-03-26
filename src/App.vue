<script setup lang="ts">
import { toRef } from 'vue'
import AppHeaderBar from './views/app/components/AppHeaderBar.vue'
import AppOverlayStack from './views/app/components/AppOverlayStack.vue'
import AppMainContent from './views/app/components/AppMainContent.vue'
import { useAppRootViewModel } from './views/app/composables/useAppRootViewModel'

// Props
interface Props {
  isDark: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDark: true
})

// Emits
const emit = defineEmits<{
  'toggle-theme': []
}>()

const {
  isVscodeLaunchEmbed,
  appEmbedMode,
  headerBarProps,
  headerBarEventHandlers,
  mainContentProps,
  mainContentEventHandlers,
  overlayProps,
  overlayEventHandlers,
} = useAppRootViewModel({
  propsIsDark: toRef(props, 'isDark'),
  onToggleTheme: () => emit('toggle-theme'),
})
</script>

<template>
  <div
    class="app-root"
    :class="{ 'app-root--embed-vscode-launch': isVscodeLaunchEmbed }"
    :data-embed-mode="appEmbedMode"
    style="height: 100vh; display: flex; flex-direction: column"
  >
    <app-header-bar
      v-bind="headerBarProps"
      v-on="headerBarEventHandlers"
    />
    
    <app-main-content
      v-bind="mainContentProps"
      v-on="mainContentEventHandlers"
    />
    <app-overlay-stack
      v-bind="overlayProps"
      v-on="overlayEventHandlers"
    />
  </div>
</template>
