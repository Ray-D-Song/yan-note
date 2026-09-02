import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

import type { ColorScheme } from '@/stores/theme'

const codeMirrorLightTheme = EditorView.theme(
  {
    '&': {
      color: '#383a42',
      backgroundColor: 'transparent',
    },
    '.cm-content': {
      caretColor: '#526fff',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#526fff',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: '#d7d4f0',
      },
    '.cm-panels': {
      backgroundColor: '#f8f9ff',
      color: '#383a42',
    },
    '.cm-activeLine': {
      backgroundColor: '#eceef4',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#9da5b4',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#eceef4',
    },
    '.cm-tooltip': {
      border: 'none',
      backgroundColor: '#f8f9ff',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#eceef4',
      color: '#383a42',
    },
  },
  { dark: false },
)

const codeMirrorLightHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#a626a4' },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#e45649' },
  { tag: [t.function(t.variableName), t.labelName], color: '#4078f2' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#986801' },
  { tag: [t.definition(t.name), t.separator], color: '#383a42' },
  {
    tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace],
    color: '#c18401',
  },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#0184bc' },
  { tag: [t.meta, t.comment], color: '#a0a1a7' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#4078f2', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: '#e45649' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#986801' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#50a14f' },
  { tag: t.invalid, color: '#ffffff' },
])

export const codeMirrorLight: Extension = [
  codeMirrorLightTheme,
  syntaxHighlighting(codeMirrorLightHighlight),
]

export function getCodeMirrorTheme(colorScheme: ColorScheme): Extension {
  return colorScheme === 'dark' ? oneDark : codeMirrorLight
}
