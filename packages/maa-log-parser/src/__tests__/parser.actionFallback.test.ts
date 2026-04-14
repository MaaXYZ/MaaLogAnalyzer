import { describe, expect, it } from 'vitest'
import type { UnifiedFlowItem } from '@windsland52/maa-log-parser/types'
import { LogParser } from '@windsland52/maa-log-parser'

const formatTimestamp = (eventIndex: number): string => {
	const second = Math.floor(eventIndex / 1000)
	const millisecond = eventIndex % 1000
	const secondPart = String(second).padStart(2, '0')
	const msPart = String(millisecond).padStart(3, '0')
	return `2026-04-11 10:00:${secondPart}.${msPart}`
}

const makeEventLine = (
	eventIndex: number,
	message: string,
	details: Record<string, unknown>
): string => {
	return `[${formatTimestamp(eventIndex)}][INF][Px1][Tx1][test] !!!OnEventNotify!!! [handle=1] [msg=${message}] [details=${JSON.stringify(details)}]`
}

const collectActionItems = (items: UnifiedFlowItem[] | undefined): UnifiedFlowItem[] => {
	if (!items || items.length === 0) return []

	const result: UnifiedFlowItem[] = []
	const visit = (nodes: UnifiedFlowItem[]) => {
		for (const node of nodes) {
			if (node.type === 'action') result.push(node)
			if (node.children && node.children.length > 0) {
				visit(node.children)
			}
		}
	}

	visit(items)
	return result
}

describe('LogParser strict action projection', () => {
	it('does not create fallback action flow item from PipelineNode.Failed action_details', async () => {
		const lines = [
			makeEventLine(1, 'Tasker.Task.Starting', { task_id: 81, entry: 'MainTask', hash: 'h-81', uuid: 'u-81' }),
			makeEventLine(2, 'Node.PipelineNode.Starting', { task_id: 81, node_id: 8101, name: 'MainNode' }),
			makeEventLine(3, 'Node.PipelineNode.Failed', {
				task_id: 81,
				node_id: 8101,
				name: 'MainNode',
				action_details: {
					action_id: 9001,
					name: 'FallbackAction',
					action: 'Click',
					box: [0, 0, 0, 0],
					detail: {},
					success: false,
				},
			}),
			makeEventLine(4, 'Tasker.Task.Failed', { task_id: 81, entry: 'MainTask', hash: 'h-81', uuid: 'u-81' }),
		]

		const parser = new LogParser()
		await parser.parseFile(lines.join('\n'))

		const tasks = parser.getTasksSnapshot()
		const task = tasks.find(item => item.task_id === 81)
		expect(task).toBeTruthy()
		expect(task?.nodes.length).toBe(1)

		const node = task!.nodes[0]
		const actionItems = collectActionItems(node.node_flow)
		expect(actionItems).toHaveLength(0)
	})

	it('does not create fallback action flow item when action_details is absent', async () => {
		const lines = [
			makeEventLine(11, 'Tasker.Task.Starting', { task_id: 82, entry: 'MainTask', hash: 'h-82', uuid: 'u-82' }),
			makeEventLine(12, 'Node.PipelineNode.Starting', { task_id: 82, node_id: 8201, name: 'MainNode' }),
			makeEventLine(13, 'Node.PipelineNode.Failed', {
				task_id: 82,
				node_id: 8201,
				name: 'MainNode',
			}),
			makeEventLine(14, 'Tasker.Task.Failed', { task_id: 82, entry: 'MainTask', hash: 'h-82', uuid: 'u-82' }),
		]

		const parser = new LogParser()
		await parser.parseFile(lines.join('\n'))

		const tasks = parser.getTasksSnapshot()
		const task = tasks.find(item => item.task_id === 82)
		expect(task).toBeTruthy()
		expect(task?.nodes.length).toBe(1)

		const node = task!.nodes[0]
		const actionItems = collectActionItems(node.node_flow)
		expect(actionItems).toHaveLength(0)
	})
})
