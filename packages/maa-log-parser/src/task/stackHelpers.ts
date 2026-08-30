export interface TaskStackTracker {
  push: (taskId: number) => void
  pop: (taskId: number) => void
  peek: () => number
  reset: () => void
}

export const createTaskStackTracker = (rootTaskId: number): TaskStackTracker => {
  const activeTaskStack: number[] = [rootTaskId]

  const remove = (taskId: number) => {
    for (let i = activeTaskStack.length - 1; i >= 0; i--) {
      if (activeTaskStack[i] === taskId) {
        activeTaskStack.splice(i, 1)
        return
      }
    }
  }

  const push = (taskId: number) => {
    remove(taskId)
    activeTaskStack.push(taskId)
  }

  const peek = (): number => {
    return activeTaskStack.length > 0 ? activeTaskStack[activeTaskStack.length - 1] : rootTaskId
  }

  const pop = (taskId: number) => {
    remove(taskId)
    if (activeTaskStack.length === 0) {
      activeTaskStack.push(rootTaskId)
    }
  }

  const reset = () => {
    activeTaskStack.length = 0
    activeTaskStack.push(rootTaskId)
  }

  return {
    push,
    pop,
    peek,
    reset,
  }
}
