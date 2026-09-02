import { languages } from '@codemirror/language-data'
import { CrepeBuilder } from '@milkdown/crepe/builder'
import { blockEdit } from '@milkdown/crepe/feature/block-edit'
import { codeMirror } from '@milkdown/crepe/feature/code-mirror'
import { imageBlock } from '@milkdown/crepe/feature/image-block'
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip'
import { listItem } from '@milkdown/crepe/feature/list-item'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { table } from '@milkdown/crepe/feature/table'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import type { NodeViewFactory } from '@prosemirror-adapter/vue'

import { createCustomBlockPlugins } from '@/components/editor/plugins'
import { registerCustomSlashMenu } from '@/components/editor/plugins/slash-menu'
import { getCodeMirrorTheme } from '@/lib/codeMirrorTheme'
import type { ColorScheme } from '@/stores/theme'

export type CreateCrepeEditorOptions = {
  defaultValue?: string
  colorScheme?: ColorScheme
  onUpload?: (file: File) => Promise<string>
  nodeViewFactory?: NodeViewFactory
}

export function createCrepeEditor(
  root: HTMLElement,
  options: CreateCrepeEditorOptions = {},
) {
  const builder = new CrepeBuilder({
    root,
    defaultValue: options.defaultValue ?? '',
  })
    .addFeature(blockEdit, {
      buildMenu: registerCustomSlashMenu,
    })
    .addFeature(toolbar)
    .addFeature(placeholder, {
      text: "输入 '/' 唤起命令",
      mode: 'block',
    })
    .addFeature(listItem)
    .addFeature(linkTooltip)
    .addFeature(table)
    .addFeature(codeMirror, {
      languages,
      theme: getCodeMirrorTheme(options.colorScheme ?? 'light'),
      searchPlaceholder: '搜索语言',
      noResultText: '无匹配语言',
      copyText: '复制',
    })

  if (options.onUpload) {
    builder.addFeature(imageBlock, {
      onUpload: options.onUpload,
    })
  }

  for (const plugin of createCustomBlockPlugins(options.nodeViewFactory)) {
    builder.editor.use(plugin as never)
  }

  return builder
}
