import type { Ctx } from '@milkdown/kit/ctx'
import { commandsCtx, editorViewOptionsCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import { $command, $nodeSchema } from '@milkdown/kit/utils'
import type { NodeViewFactory } from '@prosemirror-adapter/vue'

import DatabaseBlockView from './DatabaseBlockView.vue'
import { useDatabasesStore } from '@/stores/databases'

type MarkdownNode = {
  type: string
  attributes?: Record<string, string>
}

export const databaseBlockSchema = $nodeSchema('database_block', () => ({
  group: 'block',
  atom: true,
  attrs: {
    databaseId: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-type="database_block"]',
      getAttrs: (dom) => ({
        databaseId: (dom as HTMLElement).dataset.databaseId ?? '',
      }),
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'database_block',
      'data-database-id': node.attrs.databaseId,
      class: 'yn-database-block',
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'database_block',
    runner: (state, node, type) => {
      const markdownNode = node as MarkdownNode
      state.addNode(type, {
        databaseId: markdownNode.attributes?.databaseId ?? '',
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'database_block',
    runner: (state, node) => {
      state.addNode('database_block', undefined, undefined, {
        databaseId: node.attrs.databaseId,
      })
    },
  },
}))

export const insertDatabaseBlockCommand = $command(
  'InsertDatabaseBlock',
  (ctx) => (payload?: { databaseId?: string }) => {
    const databaseType = databaseBlockSchema.type(ctx)

    return (state, dispatch) => {
      const { $from } = state.selection
      const block = databaseType.create({
        databaseId: payload?.databaseId ?? '',
      })
      if (!block) {
        return false
      }

      const tr = state.tr.replaceWith($from.before(), $from.after(), block)
      dispatch?.(tr.scrollIntoView())
      return true
    }
  },
)

export async function runInsertDatabaseBlock(ctx: Ctx, noteId: string | null) {
  const store = useDatabasesStore()
  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
  const database = await store.createDatabase({
    note_id: noteId,
    title: '新数据库',
  })
  ctx.get(commandsCtx).call(insertDatabaseBlockCommand.key, {
    databaseId: database.id,
  })
}

export function createDatabasePlugins(nodeViewFactory?: NodeViewFactory): unknown[] {
  const plugins: unknown[] = [databaseBlockSchema, insertDatabaseBlockCommand]

  if (nodeViewFactory) {
    plugins.push((ctx: Ctx) => {
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        nodeViews: {
          ...prev.nodeViews,
          database_block: nodeViewFactory({
            component: DatabaseBlockView,
            as: 'div',
          }),
        },
      }))
    })
  }

  return plugins
}
