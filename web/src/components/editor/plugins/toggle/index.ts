import type { Ctx } from '@milkdown/kit/ctx'
import { commandsCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand, paragraphSchema } from '@milkdown/kit/preset/commonmark'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { $command, $nodeSchema, $prose } from '@milkdown/kit/utils'

type MarkdownNode = {
  type: string
  attributes?: Record<string, string>
  children?: MarkdownNode[]
}

export const toggleSchema = $nodeSchema('toggle', () => ({
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: {
    title: { default: 'Toggle' },
    open: { default: true },
  },
  parseDOM: [
    {
      tag: 'div[data-type="toggle"]',
      getAttrs: (dom) => {
        const element = dom as HTMLElement
        return {
          title: element.dataset.title ?? 'Toggle',
          open: element.dataset.open !== 'false',
        }
      },
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'toggle',
      'data-title': node.attrs.title,
      'data-open': node.attrs.open ? 'true' : 'false',
      class: `yn-toggle${node.attrs.open ? ' is-open' : ''}`,
    },
    ['div', { class: 'yn-toggle-summary', contenteditable: 'false' }, node.attrs.title],
    ['div', { class: 'yn-toggle-body', ...(node.attrs.open ? {} : { hidden: 'hidden' }) }, 0],
  ],
  parseMarkdown: {
    match: (node) => node.type === 'toggle',
    runner: (state, node, type) => {
      const markdownNode = node as MarkdownNode
      state
        .openNode(type, {
          title: markdownNode.attributes?.title ?? 'Toggle',
          open: markdownNode.attributes?.open !== 'false',
        })
        .next(markdownNode.children ?? [])
        .closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'toggle',
    runner: (state, node) => {
      const runner = state as unknown as {
        openNode: (type: string, attrs?: Record<string, unknown>) => typeof state
        next: (content: unknown) => typeof state
        closeNode: () => void
      }
      runner.openNode('toggle', {
        title: node.attrs.title,
        open: node.attrs.open ? 'true' : 'false',
      })
      runner.next(node.content)
      runner.closeNode()
    },
  },
}))

export const toggleInteractionPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('YAN_TOGGLE'),
    props: {
      handleDOMEvents: {
        click(view, event) {
          const target = event.target as HTMLElement | null
          const summary = target?.closest('.yn-toggle-summary')
          if (!summary) {
            return false
          }

          const root = summary.closest('[data-type="toggle"]')
          if (!root) {
            return false
          }

          const pos = view.posAtDOM(root, 0)
          const node = view.state.doc.nodeAt(pos)
          if (!node || node.type.name !== 'toggle') {
            return false
          }

          const open = !node.attrs.open
          view.dispatch(
            view.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              open,
            }),
          )
          return true
        },
      },
    },
  })
})

export const insertToggleCommand = $command(
  'InsertToggle',
  (ctx) => (payload?: { title?: string }) => {
    const title = payload?.title ?? 'Toggle'
    const toggleType = toggleSchema.type(ctx)
    const paragraph = paragraphSchema.type(ctx)

    return (state, dispatch) => {
      const { $from } = state.selection
      const block = toggleType.create({ title, open: true }, paragraph.create())
      if (!block) {
        return false
      }

      const tr = state.tr.replaceWith($from.before(), $from.after(), block)
      dispatch?.(tr.scrollIntoView())
      return true
    }
  },
)

export function runInsertToggle(ctx: Ctx) {
  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
  ctx.get(commandsCtx).call(insertToggleCommand.key, { title: 'Toggle' })
}
