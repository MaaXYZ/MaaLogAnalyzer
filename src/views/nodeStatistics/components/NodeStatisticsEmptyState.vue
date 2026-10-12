<script setup lang="ts">
import { NEmpty, NText } from 'naive-ui'
</script>

<template>
  <div style="padding: 40px">
    <n-empty description="请先在日志分析中加载日志">
      <template #extra>
        <n-text depth="3">运行统计会复用日志分析中已加载的日志数据。</n-text>
      </template>
    </n-empty>
  </div>
</template>
