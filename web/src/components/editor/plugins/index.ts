import { $remark } from '@milkdown/kit/utils'
import type { NodeViewFactory } from '@prosemirror-adapter/vue'

import { calloutSchema, insertCalloutCommand, runInsertCallout } from './callout'
import { columnGroupSchema, columnSchema, insertColumnsCommand, runInsertColumns } from './columns'
import { createDatabasePlugins } from './database'
import {
  insertToggleCommand,
  runInsertToggle,
  toggleInteractionPlugin,
  toggleSchema,
} from './toggle'

export { registerCustomSlashMenu } from './slash-menu'

type ContainerBlock = {
  type: string
  attrs: Record<string, string>
  bodyLines: string[]
}

function parseContainerBlocks(source: string): ContainerBlock[] {
  const lines = source.split('\n')
  const blocks: ContainerBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const match = line.match(/^:::(\w+)(?:\s+(.*))?$/)
    if (!match || !match[1]) {
      index += 1
      continue
    }

    const type = match[1]
    const attrs: Record<string, string> = {}
    const attrPart = match[2]
    if (attrPart) {
      for (const attrMatch of attrPart.matchAll(/(\w+)="([^"]*)"/g)) {
        if (attrMatch[1]) {
          attrs[attrMatch[1]] = attrMatch[2] ?? ''
        }
      }
      if (type === 'toggle' && !attrPart.includes('=')) {
        attrs.title = attrPart.replace(/^"|"$/g, '')
      } else if (type === 'callout' && !attrPart.includes('=')) {
        attrs.type = attrPart
      }
    }

    index += 1
    const bodyLines: string[] = []
    while (index < lines.length && lines[index] !== ':::') {
      bodyLines.push(lines[index] ?? '')
      index += 1
    }
    if (lines[index] === ':::') {
      index += 1
    }

    blocks.push({ type, attrs, bodyLines })
  }

  return blocks
}

function linesToParagraphs(lines: string[]) {
  const paragraphs = lines.join('\n').trim()
  if (!paragraphs) {
    return []
  }

  return paragraphs.split('\n\n').map((paragraph) => ({
    type: 'paragraph',
    children: [{ type: 'text', value: paragraph.replace(/\n/g, ' ') }],
  }))
}

const containerRemark = $remark('ynContainerRemark', () => () => (tree, file) => {
  const source = String(file?.value ?? '')
  if (!source.includes(':::')) {
    return
  }

  const parsed = parseContainerBlocks(source)
  if (parsed.length === 0) {
    return
  }

  const children: Array<Record<string, unknown>> = []

  for (const block of parsed) {
    if (block.type === 'callout') {
      children.push({
        type: 'callout',
        attributes: { variant: block.attrs.type ?? 'info' },
        children: linesToParagraphs(block.bodyLines),
      })
      continue
    }

    if (block.type === 'toggle') {
      children.push({
        type: 'toggle',
        attributes: {
          title: block.attrs.title ?? 'Toggle',
          open: block.attrs.open ?? 'true',
        },
        children: linesToParagraphs(block.bodyLines),
      })
      continue
    }

    if (block.type === 'columns') {
      const count = Number(block.attrs.count ?? '2')
      const columnBlocks = parseContainerBlocks(block.bodyLines.join('\n')).filter(
        (item) => item.type === 'column',
      )
      children.push({
        type: 'column_group',
        attributes: { count: String(count) },
        children: (columnBlocks.length > 0
          ? columnBlocks
          : Array.from({ length: count }, () => ({
              type: 'column',
              attrs: {},
              bodyLines: [],
            }))
        ).map((column) => ({
          type: 'column',
          children: linesToParagraphs(column.bodyLines),
        })),
      })
      continue
    }

    if (block.type === 'database') {
      children.push({
        type: 'database_block',
        attributes: { databaseId: block.attrs.id ?? '' },
      })
    }
  }

  if (children.length > 0) {
    tree.children = children as unknown as typeof tree.children
  }
})

export function createCustomBlockPlugins(
  nodeViewFactory?: NodeViewFactory,
): Array<unknown> {
  return [
    calloutSchema,
    insertCalloutCommand,
    toggleSchema,
    insertToggleCommand,
    toggleInteractionPlugin,
    columnSchema,
    columnGroupSchema,
    insertColumnsCommand,
    containerRemark,
    ...createDatabasePlugins(nodeViewFactory),
  ]
}

export {
  runInsertCallout,
  runInsertToggle,
  runInsertColumns,
}
