import type { BlockEditFeatureConfig } from '@milkdown/crepe/feature/block-edit'

import {
  runInsertCallout,
  runInsertColumns,
  runInsertToggle,
} from '@/components/editor/plugins'
import { runInsertDatabaseBlock } from '@/components/editor/plugins/database'
import { remixIconSvg } from '@/lib/remixIconSvg'

export const slashMenuContext = {
  noteId: null as string | null,
}

export const registerCustomSlashMenu: NonNullable<
  BlockEditFeatureConfig['buildMenu']
> = (builder) => {
  const blockGroup = builder.addGroup('block', 'block')

  blockGroup.addItem('callout-info', {
    label: 'Callout · 信息',
    icon: remixIconSvg.lightbulb,
    onRun: (ctx) => runInsertCallout(ctx, 'info'),
  })

  blockGroup.addItem('callout-warning', {
    label: 'Callout · 警告',
    icon: remixIconSvg.alert,
    onRun: (ctx) => runInsertCallout(ctx, 'warning'),
  })

  blockGroup.addItem('toggle', {
    label: 'Toggle 折叠块',
    icon: remixIconSvg.arrowRight,
    onRun: (ctx) => runInsertToggle(ctx),
  })

  blockGroup.addItem('columns-2', {
    label: '两栏布局',
    icon: remixIconSvg.columns2,
    onRun: (ctx) => runInsertColumns(ctx, 2),
  })

  blockGroup.addItem('columns-3', {
    label: '三栏布局',
    icon: remixIconSvg.columns3,
    onRun: (ctx) => runInsertColumns(ctx, 3),
  })

  blockGroup.addItem('database', {
    label: 'Database 数据库',
    icon: remixIconSvg.database,
    onRun: (ctx) => {
      void runInsertDatabaseBlock(ctx, slashMenuContext.noteId)
    },
  })
}
