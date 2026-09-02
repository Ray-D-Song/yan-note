import type { Ctx } from '@milkdown/kit/ctx'
import { commandsCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand, paragraphSchema } from '@milkdown/kit/preset/commonmark'
import { $command, $nodeSchema } from '@milkdown/kit/utils'

type MarkdownNode = {
  type: string
  attributes?: Record<string, string>
  children?: MarkdownNode[]
}

export const calloutSchema = $nodeSchema('callout', () => ({
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: {
    variant: { default: 'info' },
  },
  parseDOM: [
    {
      tag: 'div[data-type="callout"]',
      getAttrs: (dom) => ({
        variant: (dom as HTMLElement).dataset.calloutType ?? 'info',
      }),
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'callout',
      'data-callout-type': node.attrs.variant,
      class: `yn-callout yn-callout-${node.attrs.variant}`,
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'callout',
    runner: (state, node, type) => {
      const markdownNode = node as MarkdownNode
      state
        .openNode(type, { variant: markdownNode.attributes?.variant ?? 'info' })
        .next(markdownNode.children ?? [])
        .closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout',
    runner: (state, node) => {
      state.openNode('callout', undefined, { variant: node.attrs.variant })
      state.next(node.content)
      state.closeNode()
    },
  },
}))

export const insertCalloutCommand = $command(
  'InsertCallout',
  (ctx) => (payload?: { variant?: string }) => {
    const variant = payload?.variant ?? 'info'
    const calloutType = calloutSchema.type(ctx)
    const paragraph = paragraphSchema.type(ctx)

    return (state, dispatch) => {
      const { $from } = state.selection
      const block = calloutType.create({ variant }, paragraph.create())
      if (!block) {
        return false
      }

      const tr = state.tr.replaceWith($from.before(), $from.after(), block)
      dispatch?.(tr.scrollIntoView())
      return true
    }
  },
)

export function runInsertCallout(ctx: Ctx, variant = 'info') {
  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
  ctx.get(commandsCtx).call(insertCalloutCommand.key, { variant })
}
