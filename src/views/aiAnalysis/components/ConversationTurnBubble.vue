<script setup lang="ts">
import { NFlex, NTag, NText } from 'naive-ui'

interface Props {
  question: string
  answerHtml: string
  streaming?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
})
</script>

<template>
  <div :class="['turn-item', props.streaming && 'turn-item-streaming']">
    <n-flex v-if="props.streaming" align="center" justify="space-between" style="gap: 8px; flex-wrap: wrap">
      <n-tag size="small" type="warning">进行中</n-tag>
      <n-tag size="small" type="info">流式输出</n-tag>
    </n-flex>
    <div class="turn-question-box turn-bubble-user">
      <n-text depth="3" style="font-size: 12px">用户</n-text>
      <pre class="turn-question-text">{{ props.question }}</pre>
    </div>
    <div class="turn-answer-box turn-bubble-assistant markdown-body" v-html="props.answerHtml"></div>
  </div>
</template>

<style scoped>
.turn-item {
  border: 1px solid rgba(127, 231, 196, 0.55);
  border-left: 4px solid rgba(127, 231, 196, 0.9);
  border-radius: 10px;
  padding: 10px 10px 10px 12px;
  background: rgba(127, 231, 196, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.turn-item-streaming {
  border-style: dashed;
  background: rgba(127, 231, 196, 0.12);
}

.turn-question-box {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  padding: 8px 10px;
}

.turn-question-text {
  margin: 4px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.5;
  font-size: 12px;
}

.turn-answer-box {
  border: 1px solid rgba(127, 231, 196, 0.6);
  border-radius: 8px;
  background: rgba(127, 231, 196, 0.14);
  padding: 8px 10px;
}

.turn-bubble-user {
  border-color: rgba(242, 201, 125, 0.65);
  background: rgba(242, 201, 125, 0.12);
}

.turn-bubble-assistant {
  border-color: rgba(127, 231, 196, 0.72);
  background: rgba(127, 231, 196, 0.16);
}

@media (max-width: 900px) {
  .turn-item {
    padding: 8px 8px 8px 10px;
    gap: 8px;
  }
}
</style>
