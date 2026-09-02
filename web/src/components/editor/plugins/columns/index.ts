import type { Ctx } from '@milkdown/kit/ctx'
import { commandsCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand, paragraphSchema } from '@milkdown/kit/preset/commonmark'
import { $command, $nodeSchema } from '@milkdown/kit/utils'

type MarkdownNode = {
  type: string
  attributes?: Record<string, string>
  children?: MarkdownNode[]
}

export const columnSchema = $nodeSchema('column', () => ({
  content: 'block+',
  defining: true,
  parseDOM: [{ tag: 'div[data-type="column"]' }],
  toDOM: () => ['div', { 'data-type': 'column', class: 'yn-column' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'column',
    runner: (state, node, type) => {
      const markdownNode = node as MarkdownNode
      state.openNode(type).next(markdownNode.children ?? []).closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'column',
    runner: (state, node) => {
      state.openNode('column')
      state.next(node.content)
      state.closeNode()
    },
  },
}))

export const columnGroupSchema = $nodeSchema('column_group', () => ({
  content: 'column+',
  group: 'block',
  defining: true,
  attrs: {
    count: { default: 2 },
  },
  parseDOM: [
    {
      tag: 'div[data-type="column_group"]',
      getAttrs: (dom) => ({
        count: Number((dom as HTMLElement).dataset.count ?? '2'),
      }),
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'column_group',
      'data-count': String(node.attrs.count),
      class: `yn-columns yn-columns-${node.attrs.count}`,
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'column_group',
    runner: (state, node, type) => {
      const markdownNode = node as MarkdownNode
      state
        .openNode(type, { count: Number(markdownNode.attributes?.count ?? 2) })
        .next(markdownNode.children ?? [])
        .closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'column_group',
    runner: (state, node) => {
      const runner = state as unknown as {
        openNode: (type: string, attrs?: Record<string, unknown>) => typeof state
        next: (content: unknown) => typeof state
        closeNode: () => void
      }
      runner.openNode('column_group', { count: String(node.attrs.count) })
      runner.next(node.content)
      runner.closeNode()
    },
  },
}))

export const insertColumnsCommand = $command(
  'InsertColumns',
  (ctx) => (payload?: { count?: number }) => {
    const count = payload?.count ?? 2
    const columnGroupType = columnGroupSchema.type(ctx)
    const columnType = columnSchema.type(ctx)
    const paragraph = paragraphSchema.type(ctx)

    return (state, dispatch) => {
      const { $from } = state.selection
      const columns = Array.from({ length: count }, () =>
        columnType.create(null, paragraph.create()),
      )
      const block = columnGroupType.create({ count }, columns)
      if (!block) {
        return false
      }

      const tr = state.tr.replaceWith($from.before(), $from.after(), block)
      dispatch?.(tr.scrollIntoView())
      return true
    }
  },
)

export function runInsertColumns(ctx: Ctx, count = 2) {
  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
  ctx.get(commandsCtx).call(insertColumnsCommand.key, { count })
}
