<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { NCard } from 'naive-ui'

const VChart = defineAsyncComponent(async () => {
  const [echartsCore, echartsRenderers, echartsCharts, echartsComponents, vueEcharts] = await Promise.all([
    import('echarts/core'),
    import('echarts/renderers'),
    import('echarts/charts'),
    import('echarts/components'),
    import('vue-echarts'),
  ])

  echartsCore.use([
    echartsRenderers.CanvasRenderer,
    echartsCharts.PieChart,
    echartsComponents.TitleComponent,
    echartsComponents.TooltipComponent,
    echartsComponents.LegendComponent,
  ])

  return vueEcharts.default
})

const props = defineProps<{
  visible: boolean
  option: any
  isMobile: boolean
}>()
</script>

<template>
  <n-card
    v-if="props.visible && props.option"
    size="small"
    style="margin-bottom: 16px"
    :bordered="false"
  >
    <div :style="{ width: '100%', height: props.isMobile ? '300px' : '400px' }">
      <v-chart :option="props.option" autoresize />
    </div>
  </n-card>
</template>
