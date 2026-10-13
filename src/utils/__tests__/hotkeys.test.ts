import { describe, expect, it } from 'vitest'
import {
  isEditableHotkeyTarget,
  isInteractiveOverlayTarget,
  isTextEntryTarget,
  matchesHotkey,
  normalizeHotkeyKey,
} from '../hotkeys'

describe('normalizeHotkeyKey', () => {
  it('lowercases single characters and keeps named keys', () => {
    expect(normalizeHotkeyKey('J')).toBe('j')
    expect(normalizeHotkeyKey('ArrowDown')).toBe('ArrowDown')
  })
})

describe('matchesHotkey', () => {
  it('matches letters case-insensitively without modifiers', () => {
    expect(matchesHotkey({ key: 'J' }, { key: 'j' })).toBe(true)
    expect(matchesHotkey({ key: 'k' }, { key: 'j' })).toBe(false)
  })

  it('treats Ctrl and Cmd as the same mod', () => {
    expect(matchesHotkey({ key: 'p', ctrlKey: true }, { key: 'p', mod: true })).toBe(true)
    expect(matchesHotkey({ key: 'p', metaKey: true }, { key: 'p', mod: true })).toBe(true)
    expect(matchesHotkey({ key: 'p' }, { key: 'p', mod: true })).toBe(false)
  })

  it('requires the exact shift/alt combination', () => {
    expect(matchesHotkey({ key: 'n', shiftKey: true }, { key: 'n' })).toBe(false)
    expect(matchesHotkey({ key: 'n', shiftKey: true }, { key: 'n', shift: true })).toBe(true)
    expect(matchesHotkey({ key: 'n', altKey: true }, { key: 'n', alt: true })).toBe(true)
  })

  it('matches named keys such as arrows', () => {
    expect(matchesHotkey({ key: 'ArrowDown' }, { key: 'ArrowDown' })).toBe(true)
    expect(matchesHotkey({ key: 'ArrowUp' }, { key: 'ArrowDown' })).toBe(false)
  })
})

describe('isEditableHotkeyTarget', () => {
  it('detects form fields and contenteditable', () => {
    expect(isEditableHotkeyTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableHotkeyTarget({ tagName: 'textarea' })).toBe(true)
    expect(isEditableHotkeyTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isEditableHotkeyTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('detects targets inside naive-ui overlays', () => {
    const insidePopover = { tagName: 'DIV', closest: (selector: string) => (selector ? {} : null) }
    expect(isEditableHotkeyTarget(insidePopover)).toBe(true)
  })

  it('allows plain page targets', () => {
    expect(isEditableHotkeyTarget({ tagName: 'DIV', closest: () => null })).toBe(false)
    expect(isEditableHotkeyTarget(null)).toBe(false)
    expect(isEditableHotkeyTarget(undefined)).toBe(false)
    expect(isEditableHotkeyTarget('body')).toBe(false)
  })

  it('splits text entry from overlay so Esc can still work inside inputs', () => {
    const input = { tagName: 'INPUT', closest: () => null }
    const overlay = { tagName: 'DIV', closest: () => ({}) }

    expect(isTextEntryTarget(input)).toBe(true)
    expect(isInteractiveOverlayTarget(input)).toBe(false)
    expect(isTextEntryTarget(overlay)).toBe(false)
    expect(isInteractiveOverlayTarget(overlay)).toBe(true)
  })
})
