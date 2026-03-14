/**
 * Example test file demonstrating Vitest setup
 * Tests the groupDialogue utility function
 */
import { describe, it, expect } from 'vitest'
import { groupDialogue } from '../utils/groupDialogue'
import type { DialogueEntry } from '../types'

describe('groupDialogue', () => {
  it('should return empty array for empty input', () => {
    const result = groupDialogue([])
    expect(result).toEqual([])
  })

  it('should group agent entries with judge evaluations', () => {
    const entries: DialogueEntry[] = [
      { role: 'proposer', agent_name: '正方', content: 'Hello', timestamp: '2024-01-01T00:00:00Z', citations: [] },
      { role: 'judge', agent_name: '裁判', content: 'Good point', timestamp: '2024-01-01T00:01:00Z', citations: [], target_role: 'proposer' },
      { role: 'opposer', agent_name: '反方', content: 'Hi', timestamp: '2024-01-01T00:02:00Z', citations: [] },
    ]

    const result = groupDialogue(entries)

    expect(result).toHaveLength(2)
    expect(result[0].agent?.role).toBe('proposer')
    expect(result[0].judge?.role).toBe('judge')
    expect(result[1].agent?.role).toBe('opposer')
    expect(result[1].judge).toBeNull()
  })

  it('should handle single entry', () => {
    const entries: DialogueEntry[] = [
      { role: 'judge', agent_name: '裁判长', content: 'Decision', timestamp: '2024-01-01T00:00:00Z', citations: [] },
    ]

    const result = groupDialogue(entries)

    expect(result).toHaveLength(1)
    expect(result[0].agent).toBeNull()
    expect(result[0].judge?.role).toBe('judge')
  })
})
