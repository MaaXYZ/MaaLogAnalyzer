<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { 
  NCard, 
  NInput, 
  NButton, 
  NFlex, 
  NText, 
  NEmpty,
  NList,
  NListItem,
  NTag,
  NCheckbox,
  NInputGroup,
  NCollapse,
  NCollapseItem,
  NSplit,
  NScrollbar,
  NIcon,
  NSpin
} from 'naive-ui'
import { SearchOutlined, FileTextOutlined, CloseOutlined } from '@vicons/antd'

const searchText = ref('')
const fileContent = ref('')  // 保留用于小文件（<5MB）
const fileName = ref('')
const fileSizeInMB = ref(0)  // 文件大小（MB）
const caseSensitive = ref(true)  // 默认区分大小写
const useRegex = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const maxResults = 500  // 固定最大结果数
const isSearching = ref(false)
const isLoadingFile = ref(false)  // 是否正在加载文件
const selectedLine = ref<number | null>(null)  // 当前选中的行
const searchHistory = ref<string[]>([])  // 搜索历史
const showFileContent = ref(false)  // 是否显示文件内容（默认关闭以节省内存）
const contentKey = ref(0)  // 用于强制重新渲染，释放内存
let abortSearch = false  // 中断搜索标志

// 新增：流式加载相关
const isLargeFile = ref(false)  // 是否是大文件（>5MB）
const fileHandle = ref<File | null>(null)  // 文件句柄（用于流式读取）
const totalLines = ref(0)  // 总行数
const contextLines = ref<string[]>([])  // 选中行的上下文（大文件模式）
const contextStartLine = ref(0)  // 上下文起始行号

// 快捷搜索选项
const quickSearchOptions = [
  'reco hit',
  'Version',
  '[ERR]',
  'display_width_='
]

// 搜索结果
interface SearchResult {
  lineNumber: number
  line: string
  matchStart: number
  matchEnd: number
  context: string
}

const searchResults = ref<SearchResult[]>([])
const totalMatches = ref(0)

// 加载搜索历史
onMounted(() => {
  const saved = localStorage.getItem('searchHistory')
  if (saved) {
    try {
      searchHistory.value = JSON.parse(saved)
    } catch (e) {
      console.error('加载搜索历史失败:', e)
    }
  }
})

// 保存搜索历史
const saveSearchHistory = () => {
  try {
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory.value))
  } catch (e) {
    console.error('保存搜索历史失败:', e)
  }
}

// 添加到搜索历史
const addToHistory = (text: string) => {
  if (!text || text.trim() === '') return
  
  // 移除已存在的相同项
  const index = searchHistory.value.indexOf(text)
  if (index > -1) {
    searchHistory.value.splice(index, 1)
  }
  
  // 添加到开头
  searchHistory.value.unshift(text)
  
  // 限制历史记录数量（最多20条）
  if (searchHistory.value.length > 20) {
    searchHistory.value = searchHistory.value.slice(0, 20)
  }
  
  saveSearchHistory()
}

// 从历史中删除
const removeFromHistory = (text: string) => {
  const index = searchHistory.value.indexOf(text)
  if (index > -1) {
    searchHistory.value.splice(index, 1)
    saveSearchHistory()
  }
}

// 使用历史记录
const useHistoryItem = (text: string) => {
  searchText.value = text
  performSearch()
}

// 执行搜索（支持流式搜索）
const performSearch = async () => {
  if (!searchText.value) {
    searchResults.value = []
    totalMatches.value = 0
    return
  }
  
  // 检查是否正在加载文件
  if (isLoadingFile.value) {
    console.warn('⏳ 文件正在加载中，请稍候...')
    return
  }
  
  // 检查是否有文件
  if (!fileName.value || (!fileContent.value && !fileHandle.value)) {
    console.warn('❌ 请先加载文件')
    alert('请先选择文件')
    return
  }
  
  isSearching.value = true
  abortSearch = false
  
  try {
    if (isLargeFile.value && fileHandle.value) {
      // 大文件：流式搜索
      await performStreamSearch()
    } else {
      // 小文件：传统搜索
      await performNormalSearch()
    }
    
    if (searchText.value && !abortSearch) {
      addToHistory(searchText.value)
    }
  } catch (error) {
    console.error('搜索失败:', error)
    alert('搜索失败: ' + error)
  } finally {
    isSearching.value = false
  }
}

// 传统搜索（小文件）
const performNormalSearch = async () => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        const lines = fileContent.value.split('\n')
        const results: SearchResult[] = []
        let searchPattern: RegExp | null = null
        
        // 编译正则表达式（如果使用）
        if (useRegex.value) {
          try {
            searchPattern = new RegExp(searchText.value, caseSensitive.value ? 'g' : 'gi')
          } catch (e) {
            console.error('正则表达式错误:', e)
            resolve()
            return
          }
        }
        
        // 搜索
        for (let index = 0; index < lines.length; index++) {
          if (abortSearch || results.length >= maxResults) break
          
          const line = lines[index]
          const match = findMatchInLine(line, searchPattern)
          
          if (match) {
            results.push({
              lineNumber: index + 1,
              line: line,
              matchStart: match.start,
              matchEnd: match.end,
              context: line
            })
          }
        }
        
        searchResults.value = results
        totalMatches.value = results.length
      } finally {
        resolve()
      }
    }, 10)
  })
}

// 流式搜索（大文件）
const performStreamSearch = async () => {
  if (!fileHandle.value) return
  
  console.log('🔍 开始流式搜索...')
  
  const results: SearchResult[] = []
  const reader = fileHandle.value.stream().getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lineNumber = 0
  let searchPattern: RegExp | null = null
  
  // 编译正则表达式
  if (useRegex.value) {
    try {
      searchPattern = new RegExp(searchText.value, caseSensitive.value ? 'g' : 'gi')
    } catch (e) {
      console.error('正则表达式错误:', e)
      return
    }
  }
  
  try {
    while (true) {
      if (abortSearch) {
        console.log('搜索已中断')
        break
      }
      
      const { done, value } = await reader.read()
      if (done) break
      
      // 解码数据
      buffer += decoder.decode(value, { stream: true })
      
      // 处理完整的行
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''  // 保留最后一个不完整的行
      
      // 搜索每一行
      for (const line of lines) {
        lineNumber++
        
        if (results.length >= maxResults) {
          reader.releaseLock()
          searchResults.value = results
          totalMatches.value = results.length
          console.log(`✅ 达到最大结果数 ${maxResults}，停止搜索`)
          return
        }
        
        const match = findMatchInLine(line, searchPattern)
        
        if (match) {
          results.push({
            lineNumber: lineNumber,
            line: line,
            matchStart: match.start,
            matchEnd: match.end,
            context: line
          })
        }
      }
    }
    
    // 处理最后一行
    if (buffer) {
      lineNumber++
      const match = findMatchInLine(buffer, searchPattern)
      if (match && results.length < maxResults) {
        results.push({
          lineNumber: lineNumber,
          line: buffer,
          matchStart: match.start,
          matchEnd: match.end,
          context: buffer
        })
      }
    }
  } finally {
    reader.releaseLock()
  }
  
  searchResults.value = results
  totalMatches.value = results.length
  console.log(`✅ 搜索完成：找到 ${results.length} 个结果`)
}

// 在一行中查找匹配（统一逻辑）
const findMatchInLine = (line: string, searchPattern: RegExp | null): { start: number; end: number } | null => {
  let matchStart = -1
  let matchEnd = -1
  
  if (useRegex.value && searchPattern) {
    // 正则搜索
    const matchResult = line.match(searchPattern)
    if (matchResult && matchResult.index !== undefined) {
      matchStart = matchResult.index
      matchEnd = matchStart + matchResult[0].length
    }
  } else {
    // 普通文本搜索
    if (caseSensitive.value) {
      matchStart = line.indexOf(searchText.value)
      if (matchStart !== -1) {
        matchEnd = matchStart + searchText.value.length
      }
    } else {
      const lowerLine = line.toLowerCase()
      const lowerSearch = searchText.value.toLowerCase()
      matchStart = lowerLine.indexOf(lowerSearch)
      if (matchStart !== -1) {
        matchEnd = matchStart + searchText.value.length
      }
    }
  }
  
  return matchStart !== -1 ? { start: matchStart, end: matchEnd } : null
}

// 处理文件上传（智能加载策略）
const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return
  
  isLoadingFile.value = true
  
  try {
    fileName.value = file.name
    fileSizeInMB.value = file.size / 1024 / 1024
    
    console.log(`📂 正在加载文件: ${file.name} (${fileSizeInMB.value.toFixed(2)} MB)`)
    
    // 策略选择
    if (fileSizeInMB.value < 5) {
      // 小文件：直接加载到内存
      console.log('📄 小文件模式：直接加载')
      isLargeFile.value = false
      fileContent.value = await file.text()
      totalLines.value = fileContent.value.split('\n').length
      fileHandle.value = null
    } else {
      // 大文件：流式加载模式
      console.log('📦 大文件模式：流式加载')
      isLargeFile.value = true
      fileContent.value = ''  // 不加载内容
      fileHandle.value = file
      
      // 快速统计行数（不加载全部内容）
      totalLines.value = await countLinesInFile(file)
    }
    
    console.log(`✅ 文件加载完成：${totalLines.value} 行`)
  } catch (error) {
    console.error('文件读取失败:', error)
    alert('文件读取失败: ' + error)
  } finally {
    isLoadingFile.value = false
  }
}

// 快速统计文件行数（不加载全部内容）
const countLinesInFile = async (file: File): Promise<number> => {
  let lineCount = 0
  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      lineCount += lines.length - 1
      buffer = lines[lines.length - 1]  // 保留最后一行
    }
    
    if (buffer) lineCount++  // 最后一行
  } finally {
    reader.releaseLock()
  }
  
  return lineCount
}

// 高亮显示匹配文本
const highlightMatch = (result: SearchResult) => {
  const before = result.line.substring(0, result.matchStart)
  const match = result.line.substring(result.matchStart, result.matchEnd)
  const after = result.line.substring(result.matchEnd)
  
  return { before, match, after }
}

// 清除内容（激进模式 + 流式支持）
const clearContent = () => {
  console.log('🗑️ 开始清除内容（激进模式）...')
  
  // 1. 立即中断所有操作
  abortSearch = true
  isSearching.value = false
  
  // 2. 强制卸载所有组件
  contentKey.value++
  console.log(`🔄 强制重新渲染 (key: ${contentKey.value})`)
  
  // 3. 隐藏内容显示
  showFileContent.value = false
  selectedLine.value = null
  
  // 4. 清空所有数组和对象
  searchResults.value = []
  totalMatches.value = 0
  searchText.value = ''
  
  // 5. 清空流式加载相关
  isLargeFile.value = false
  fileHandle.value = null
  totalLines.value = 0
  fileSizeInMB.value = 0
  contextLines.value = []
  contextStartLine.value = 0
  
  // 6. 使用 nextTick 确保 Vue 完成更新
  nextTick(() => {
    console.log('📝 清除文件内容...')
    
    const oldSize = fileSizeInMB.value
    
    // 清除文件内容
    fileContent.value = ''
    fileName.value = ''
    
    // 重置 file input
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
    
    console.log(`✅ 已清除 ${oldSize.toFixed(2)} MB 的内容`)
    console.log('⏳ 等待浏览器 GC...（大文件模式：内存应立即释放）')
    
    // 7. 尝试触发 GC
    if (typeof window !== 'undefined' && 'gc' in window) {
      console.log('🧹 手动触发 GC...')
      ;(window as any).gc()
    }
    
    // 8. 最终确认
    nextTick(() => {
      console.log('💾 内存清理完成')
      console.log('✨ 大文件模式下，内存占用应该大幅下降（不再保存文件内容）')
    })
  })
}

// 触发文件选择
const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

// 文件内容行数组（懒加载）
const fileLines = computed(() => {
  if (!fileContent.value) return []
  return fileContent.value.split('\n')
})

// 带行号的文件内容（用于显示）
const fileContentWithLineNumbers = computed(() => {
  if (!fileContent.value || !showFileContent.value) return ''
  
  const lines = fileLines.value
  const numberedLines = lines.map((line, index) => {
    const lineNum = (index + 1).toString().padStart(6, ' ')
    return `${lineNum} | ${line}`
  })
  
  return numberedLines.join('\n')
})

// 跳转到指定行
const jumpToLine = async (lineNumber: number) => {
  selectedLine.value = lineNumber
  
  // 大文件模式：读取上下文
  if (isLargeFile.value && fileHandle.value) {
    console.log(`📍 读取行 ${lineNumber} 附近的内容...`)
    await loadContextLines(lineNumber)
    return
  }
  
  // 小文件模式：显示文件内容
  if (!showFileContent.value) {
    showFileContent.value = true
  }
  
  // 使用文本搜索定位
  setTimeout(() => {
    const textarea = document.getElementById('file-content-display') as HTMLTextAreaElement
    if (textarea && fileContentWithLineNumbers.value) {
      const lines = fileContentWithLineNumbers.value.split('\n')
      const targetLineIndex = lineNumber - 1
      
      if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
        let charPos = 0
        for (let i = 0; i < targetLineIndex; i++) {
          charPos += lines[i].length
        }
        
        textarea.focus()
        textarea.setSelectionRange(charPos, charPos + lines[targetLineIndex].length)
        
        const style = window.getComputedStyle(textarea)
        const paddingTop = parseFloat(style.paddingTop) || 12
        const paddingBottom = parseFloat(style.paddingBottom) || 12
        
        // 优先使用 scrollHeight 计算平均行高，以消除累积误差
        // 只有当行数较多时才使用此方法，避免小文件时的计算抖动
        let lineHeight: number
        if (lines.length > 100) {
          const contentHeight = textarea.scrollHeight - paddingTop - paddingBottom
          lineHeight = contentHeight / lines.length
        } else {
          lineHeight = parseFloat(style.lineHeight)
          if (isNaN(lineHeight)) {
            const fontSize = parseFloat(style.fontSize) || 13
            lineHeight = fontSize * 1.6
          }
        }
        
        const scrollTop = targetLineIndex * lineHeight + paddingTop - textarea.clientHeight / 2
        textarea.scrollTop = Math.max(0, scrollTop)
      }
    }
  }, 100)
}

// 加载指定行的上下文（大文件模式）
const loadContextLines = async (targetLine: number) => {
  if (!fileHandle.value) return
  
  // 调整上下文范围：前面少一些，后面多一些，让目标行显示在顶部
  const beforeLines = 3   // 前面只显示3行
  const afterLines = 50   // 后面显示50行
  const startLine = Math.max(1, targetLine - beforeLines)
  const endLine = Math.min(totalLines.value, targetLine + afterLines)
  
  try {
    const reader = fileHandle.value.stream().getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentLine = 0
    const lines: string[] = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const splitLines = buffer.split('\n')
      buffer = splitLines.pop() || ''
      
      for (const line of splitLines) {
        currentLine++
        
        // 只收集目标范围内的行
        if (currentLine >= startLine && currentLine <= endLine) {
          lines.push(line)
        }
        
        // 超过范围就停止
        if (currentLine > endLine) {
          reader.releaseLock()
          contextLines.value = lines
          contextStartLine.value = startLine
          console.log(`✅ 已加载 ${lines.length} 行上下文 (${startLine}-${endLine})`)
          return
        }
      }
    }
    
    // 处理最后一行
    if (buffer && currentLine < endLine) {
      currentLine++
      if (currentLine >= startLine) {
        lines.push(buffer)
      }
    }
    
    reader.releaseLock()
    contextLines.value = lines
    contextStartLine.value = startLine
    console.log(`✅ 已加载 ${lines.length} 行上下文 (${startLine}-${endLine})，目标行: ${targetLine}`)
    
    // 由于目标行在前3行，默认就显示在顶部，不需要额外滚动
  } catch (error) {
    console.error('加载上下文失败:', error)
    alert('加载上下文失败: ' + error)
  }
}

</script>

<template>
  <div style="height: 100%; display: flex; flex-direction: column">
    <!-- 顶部工具栏 -->
    <n-card 
      size="small"
      :bordered="false"
      content-style="padding: 12px 16px"
    >
      <n-flex align="center" justify="space-between" style="gap: 12px">
        <n-flex align="center" style="gap: 12px">
          <n-text strong style="font-size: 16px">📝 文本搜索</n-text>
          
          <input
            ref="fileInputRef"
            type="file"
            accept=".txt,.log,.json,.jsonl"
            @change="handleFileUpload"
            style="display: none"
          />
          <n-button 
            size="small"
            type="primary" 
            @click="triggerFileSelect"
          >
            <template #icon>
              <file-text-outlined />
            </template>
            选择文件
          </n-button>
          
          <n-button 
            v-if="fileName"
            size="small"
            @click="clearContent"
            secondary
            type="warning"
          >
            <template #icon>
              <n-icon><close-outlined /></n-icon>
            </template>
            清除
          </n-button>
        </n-flex>
        
        <n-flex align="center" style="gap: 12px">
          <n-text v-if="isLoadingFile" type="info" style="font-size: 13px">
            ⏳ 正在加载文件...
          </n-text>
          <n-text v-else-if="fileName" depth="3" style="font-size: 13px">
            📄 {{ fileName }}
          </n-text>
          <n-tag v-if="totalLines > 0 && !isLoadingFile" size="small" type="info">
            {{ totalLines }} 行
          </n-tag>
          <n-tag v-if="fileSizeInMB > 0 && !isLoadingFile" size="small" :type="isLargeFile ? 'error' : 'warning'">
            {{ fileSizeInMB.toFixed(2) }} MB
            <span v-if="isLargeFile"> (流式模式)</span>
          </n-tag>
        </n-flex>
      </n-flex>
    </n-card>
    
    <!-- 主内容区域 -->
    <n-split 
      :key="contentKey"
      style="flex: 1; min-height: 0" 
      :default-size="0.4"
      :min="0.2"
      :max="0.8"
    >
      <!-- 左侧：搜索区域 -->
      <template #1>
        <div style="height: 100%; display: flex; flex-direction: column; gap: 12px; padding: 12px">

          <!-- 搜索控制 -->
          <n-card size="small">
            <n-flex vertical style="gap: 12px">
              <n-input-group>
                <n-input
                  v-model:value="searchText"
                  placeholder="输入搜索内容..."
                  clearable
                  @keyup.enter="performSearch"
                  :disabled="isSearching"
                >
                  <template #prefix>
                    <search-outlined />
                  </template>
                </n-input>
                <n-button 
                  type="primary" 
                  @click="performSearch"
                  :loading="isSearching || isLoadingFile"
                  :disabled="!searchText || !fileName || isLoadingFile"
                >
                  {{ isLoadingFile ? '加载中...' : '搜索' }}
                </n-button>
              </n-input-group>
              
              <!-- 搜索选项 -->
              <n-flex align="center" style="gap: 12px; flex-wrap: wrap">
                <n-checkbox v-model:checked="caseSensitive">
                  区分大小写
                </n-checkbox>
                <n-checkbox v-model:checked="useRegex">
                  正则表达式
                </n-checkbox>
              </n-flex>
              
              <!-- 快捷搜索 -->
              <div>
                <n-text depth="3" style="font-size: 12px; margin-bottom: 6px; display: block">
                  快捷搜索：
                </n-text>
                <n-flex wrap style="gap: 6px">
                  <n-button
                    v-for="option in quickSearchOptions"
                    :key="option"
                    size="tiny"
                    secondary
                    @click="useHistoryItem(option)"
                    :type="searchText === option ? 'primary' : 'default'"
                  >
                    {{ option }}
                  </n-button>
                </n-flex>
              </div>
              
              <!-- 搜索历史 -->
              <n-collapse v-if="searchHistory.length > 0" style="margin-top: 8px">
                <n-collapse-item title="📝 搜索历史" name="history">
                  <n-flex wrap style="gap: 6px">
                    <n-tag
                      v-for="(item, idx) in searchHistory.slice(0, 10)"
                      :key="idx"
                      size="small"
                      closable
                      @close="removeFromHistory(item)"
                      @click="useHistoryItem(item)"
                      style="cursor: pointer"
                      :type="searchText === item ? 'primary' : 'default'"
                    >
                      {{ item.length > 30 ? item.substring(0, 30) + '...' : item }}
                    </n-tag>
                  </n-flex>
                </n-collapse-item>
              </n-collapse>
            </n-flex>
          </n-card>

          <!-- 搜索结果 -->
          <n-card 
            size="small" 
            title="📋 搜索结果"
            style="flex: 1; min-height: 0"
            content-style="height: 100%; overflow: hidden"
          >
            <template #header-extra>
              <n-text v-if="totalMatches > 0" type="success" style="font-size: 13px">
                找到 {{ totalMatches }} 个结果
              </n-text>
            </template>
            
            <n-scrollbar style="height: 100%; padding-right: 8px">
              <n-empty 
                v-if="!fileName"
                description="请先加载文件"
              />
              
              <n-empty 
                v-else-if="isLoadingFile"
                description="文件加载中..."
              >
                <template #icon>
                  <n-spin size="large" />
                </template>
              </n-empty>
              
              <n-empty 
                v-else-if="!searchText"
                description="请输入搜索内容并点击搜索"
              />
              
              <n-empty 
                v-else-if="isSearching"
                description="搜索中..."
              >
                <template #icon>
                  <n-spin size="large" />
                </template>
              </n-empty>
              
              <n-empty 
                v-else-if="searchResults.length === 0"
                description="未找到匹配结果"
              />
              
              <n-list v-else hoverable clickable>
                <n-list-item 
                  v-for="(result, idx) in searchResults" 
                  :key="idx"
                  @click="jumpToLine(result.lineNumber)"
                  style="cursor: pointer; padding: 8px 12px"
                >
                  <n-text style="font-family: monospace; font-size: 12px; line-height: 1.6; word-break: break-all">
                    <span>{{ highlightMatch(result).before }}</span>
                    <span style="background-color: #f2c97d; color: #000; padding: 2px 4px; border-radius: 2px; font-weight: 600">
                      {{ highlightMatch(result).match }}
                    </span>
                    <span>{{ highlightMatch(result).after }}</span>
                  </n-text>
                </n-list-item>
              </n-list>
            </n-scrollbar>
          </n-card>
        </div>
      </template>
      
      <!-- 右侧：文件信息/搜索结果详情 -->
      <template #2>
        <n-card 
          :title="isLargeFile ? '📦 大文件信息' : '📄 文件内容'"
          size="small"
          style="height: 100%"
          content-style="height: 100%; overflow: hidden; padding: 0"
        >
          <template #header-extra>
            <n-button
              v-if="fileContent && !isLargeFile"
              size="tiny"
              :type="showFileContent ? 'primary' : 'default'"
              @click="showFileContent = !showFileContent"
            >
              {{ showFileContent ? '隐藏内容' : '显示内容' }}
            </n-button>
          </template>
          
          <div style="height: 100%; display: flex; flex-direction: column">
            <!-- 未加载文件 -->
            <div v-if="!fileName" style="padding: 40px 20px; text-align: center; flex: 1">
              <n-empty description="请先加载文件" />
            </div>
            
            <!-- 大文件模式 -->
            <div v-else-if="isLargeFile" style="height: 100%; display: flex; flex-direction: column">
              <!-- 有上下文：显示内容 -->
              <div v-if="contextLines.length > 0" style="flex: 1; overflow: hidden; display: flex; flex-direction: column">
                <div style="padding: 8px 12px; border-bottom: 1px solid var(--n-border-color)">
                  <n-flex align="center" justify="space-between">
                    <n-text depth="3" style="font-size: 12px">
                      显示行 {{ contextStartLine }} - {{ contextStartLine + contextLines.length - 1 }}
                      （共 {{ contextLines.length }} 行）
                    </n-text>
                    <n-text v-if="selectedLine" type="warning" style="font-size: 12px">
                      ▶ 第 {{ selectedLine }} 行
                    </n-text>
                  </n-flex>
                </div>
                <n-scrollbar style="flex: 1">
                  <div style="padding: 12px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 13px; line-height: 1.6">
                    <div 
                      v-for="(line, idx) in contextLines" 
                      :key="idx"
                      class="context-line"
                      :data-line="contextStartLine + idx"
                      :style="{
                        padding: '2px 8px',
                        backgroundColor: (contextStartLine + idx) === selectedLine ? 'var(--n-color-target)' : 'transparent',
                        borderRadius: '2px'
                      }"
                    >
                      <span style="color: var(--n-text-color-disabled); margin-right: 12px; user-select: none">
                        {{ String(contextStartLine + idx).padStart(6, ' ') }}
                      </span>
                      <span style="white-space: pre-wrap; word-break: break-all">{{ line }}</span>
                    </div>
                  </div>
                </n-scrollbar>
              </div>
              
              <!-- 无上下文：显示提示 -->
              <div v-else style="padding: 40px 20px; text-align: center; flex: 1">
                <n-empty description="大文件流式模式">
                  <template #icon>
                    <n-icon size="48" color="#f2c97d">
                      <file-text-outlined />
                    </n-icon>
                  </template>
                  <template #extra>
                    <n-flex vertical style="gap: 12px; margin-top: 16px">
                      <n-text depth="2" style="font-size: 14px">
                        文件: {{ fileName }}
                      </n-text>
                      <n-text depth="3" style="font-size: 13px">
                        大小: {{ fileSizeInMB.toFixed(2) }} MB
                      </n-text>
                      <n-text depth="3" style="font-size: 13px">
                        行数: {{ totalLines }}
                      </n-text>
                      <n-divider style="margin: 8px 0" />
                      <n-text type="success" style="font-size: 13px">
                        ✅ 采用流式加载，内存占用极小
                      </n-text>
                      <n-text depth="3" style="font-size: 12px">
                        搜索时边读边搜，不保存完整文件
                      </n-text>
                      <n-text depth="3" style="font-size: 12px">
                        💡 点击左侧搜索结果查看上下文
                      </n-text>
                    </n-flex>
                  </template>
                </n-empty>
              </div>
            </div>
            
            <!-- 小文件：隐藏内容提示 -->
            <div v-else-if="!showFileContent" style="padding: 40px 20px; text-align: center; flex: 1">
              <n-empty description="点击右上角显示文件内容">
                <template #extra>
                  <n-text depth="3" style="font-size: 12px">
                    文件已加载 ({{ totalLines }} 行)，点击搜索结果会自动显示
                  </n-text>
                </template>
              </n-empty>
            </div>
            
            <!-- 小文件：完整内容显示 -->
            <textarea
              v-else
              id="file-content-display"
              readonly
              :value="fileContentWithLineNumbers"
              style="
                flex: 1;
                width: 100%;
                border: none;
                outline: none;
                resize: none;
                padding: 12px;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.6;
                background-color: transparent;
                color: inherit;
                white-space: pre;
                overflow-x: auto;
                overflow-y: scroll;
              "
            />
          </div>
        </n-card>
      </template>
    </n-split>
  </div>
</template>
