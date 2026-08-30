import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useFlowchartPopover } from '../useFlowchartPopover'

describe('useFlowchartPopover', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clamps popover inside the canvas when the node is near the right edge', () => {
    const nodeElement = {
      getAttribute: (name: string) => name === 'data-id' ? 'NearRight' : null,
      getBoundingClientRect: () => ({
        left: 190,
        right: 290,
        top: 20,
      }),
    }
    const canvasElement = {
      querySelectorAll: vi.fn(() => [nodeElement]),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 300,
        height: 400,
      }),
    }
    const querySelector = vi.fn((selector: string) => {
      if (selector === '.flowchart-canvas') return canvasElement
      if (selector === '.node-popover') return null
      throw new Error(`Unexpected selector: ${selector}`)
    })
    vi.stubGlobal('document', { querySelector })

    const popover = useFlowchartPopover({
      flowNodes: ref([{ id: 'NearRight', data: {} }]),
    })
    popover.popoverNodeId.value = 'NearRight'

    popover.updatePopoverPosition()

    expect(popover.popoverPos.value).toEqual({ x: 16, y: 20 })
  })

  it('finds node IDs containing CSS selector syntax without interpolation', () => {
    const unsafeId = 'node"\\]#target'
    const nodeElement = {
      getAttribute: (name: string) => name === 'data-id' ? unsafeId : null,
      getBoundingClientRect: () => ({
        left: 10,
        right: 110,
        top: 20,
      }),
    }
    const canvasElement = {
      querySelectorAll: vi.fn(() => [nodeElement]),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 500,
        height: 400,
      }),
    }
    const querySelector = vi.fn((selector: string) => {
      if (selector === '.flowchart-canvas') return canvasElement
      if (selector === '.node-popover') return null
      throw new Error(`Unexpected selector: ${selector}`)
    })
    vi.stubGlobal('document', { querySelector })

    const popover = useFlowchartPopover({
      flowNodes: ref([{ id: unsafeId, data: {} }]),
    })
    popover.popoverNodeId.value = unsafeId

    expect(() => popover.updatePopoverPosition()).not.toThrow()
    expect(canvasElement.querySelectorAll).toHaveBeenCalledWith('[data-id]')
    expect(popover.popoverPos.value).toEqual({ x: 120, y: 20 })
  })
})
