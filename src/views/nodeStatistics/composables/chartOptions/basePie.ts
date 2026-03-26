export const buildPieBaseOption = (
  title: string,
  formatter: string | ((params: any) => string),
  data: Array<{ name: string; value: number }>,
  emphasisFormatter: (params: any) => string,
) => ({
  title: {
    text: title,
    left: 'center',
    textStyle: {
      fontSize: 14,
    },
  },
  tooltip: {
    trigger: 'item',
    formatter,
  },
  legend: {
    orient: 'vertical',
    left: 'left',
    top: 'middle',
    textStyle: {
      fontSize: 12,
    },
  },
  series: [
    {
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2,
      },
      label: {
        show: false,
        position: 'center',
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold',
          formatter: emphasisFormatter,
        },
      },
      labelLine: {
        show: false,
      },
      data,
    },
  ],
})

export const adaptChartForMobile = (option: any, isMobile: boolean) => {
  if (!option || !isMobile) return option
  return {
    ...option,
    legend: {
      ...option.legend,
      orient: 'horizontal',
      left: 'center',
      top: undefined,
      bottom: 0,
      textStyle: { fontSize: 11 },
    },
    series: option.series.map((seriesItem: any) => ({
      ...seriesItem,
      center: ['50%', '45%'],
      radius: ['30%', '55%'],
    })),
  }
}
