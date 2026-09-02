import type { BlockEditFeatureConfig } from '@milkdown/crepe/feature/block-edit'

import {
  runInsertCallout,
  runInsertColumns,
  runInsertToggle,
} from '@/components/editor/plugins'
import { runInsertDatabaseBlock } from '@/components/editor/plugins/database'

export const slashMenuContext = {
  noteId: null as string | null,
}

export const registerCustomSlashMenu: NonNullable<
  BlockEditFeatureConfig['buildMenu']
> = (builder) => {
  const notionGroup = builder.addGroup('notion', 'Notion 块')

  notionGroup.addItem('callout-info', {
    label: 'Callout · 信息',
    icon: '💡',
    onRun: (ctx) => runInsertCallout(ctx, 'info'),
  })

  notionGroup.addItem('callout-warning', {
    label: 'Callout · 警告',
    icon: '⚠️',
    onRun: (ctx) => runInsertCallout(ctx, 'warning'),
  })

  notionGroup.addItem('toggle', {
    label: 'Toggle 折叠块',
    icon: '▸',
    onRun: (ctx) => runInsertToggle(ctx),
  })

  notionGroup.addItem('columns-2', {
    label: '两栏布局',
    icon: '⫘',
    onRun: (ctx) => runInsertColumns(ctx, 2),
  })

  notionGroup.addItem('columns-3', {
    label: '三栏布局',
    icon: '⫸',
    onRun: (ctx) => runInsertColumns(ctx, 3),
  })

  notionGroup.addItem('database', {
    label: 'Database 数据库',
    icon: '🗂️',
    onRun: (ctx) => {
      void runInsertDatabaseBlock(ctx, slashMenuContext.noteId)
    },
  })
}
