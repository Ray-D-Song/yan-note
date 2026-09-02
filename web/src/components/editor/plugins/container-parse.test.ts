import { describe, expect, it } from 'vitest'

import { parseContainerBlocks } from './container-parse'

describe('parseContainerBlocks', () => {
  it('parses two-column layout with nested column blocks', () => {
    const source = `:::columns count="2"
:::column
你好
:::


:::column
我好
:::

:::`

    const blocks = parseContainerBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('columns')
    expect(blocks[0]?.attrs.count).toBe('2')

    const columns = parseContainerBlocks(blocks[0]?.bodyLines.join('\n') ?? '').filter(
      (item) => item.type === 'column',
    )
    expect(columns).toHaveLength(2)
    expect(columns[0]?.bodyLines.join('\n').trim()).toBe('你好')
    expect(columns[1]?.bodyLines.join('\n').trim()).toBe('我好')
  })

  it('parses three-column layout', () => {
    const source = `:::columns count="3"
:::column
A
:::
:::column
B
:::
:::column
C
:::
:::`

    const blocks = parseContainerBlocks(source)
    expect(blocks).toHaveLength(1)

    const columns = parseContainerBlocks(blocks[0]?.bodyLines.join('\n') ?? '').filter(
      (item) => item.type === 'column',
    )
    expect(columns).toHaveLength(3)
    expect(columns.map((column) => column.bodyLines.join('\n').trim())).toEqual(['A', 'B', 'C'])
  })

  it('parses single-level callout blocks', () => {
    const source = `:::callout info
提示内容
:::`

    const blocks = parseContainerBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('callout')
    expect(blocks[0]?.attrs.type).toBe('info')
    expect(blocks[0]?.bodyLines.join('\n').trim()).toBe('提示内容')
  })

  it('parses single-level toggle blocks', () => {
    const source = `:::toggle "折叠标题"
折叠内容
:::`

    const blocks = parseContainerBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('toggle')
    expect(blocks[0]?.attrs.title).toBe('折叠标题')
    expect(blocks[0]?.bodyLines.join('\n').trim()).toBe('折叠内容')
  })
})
