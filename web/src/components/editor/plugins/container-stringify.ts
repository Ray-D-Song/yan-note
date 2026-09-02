type MdastNode = {
  type: string
  variant?: string
  title?: string
  open?: string
  count?: string
  databaseId?: string
  attributes?: Record<string, string>
  children?: MdastNode[]
}

type StringifyState = {
  enter: (name: string) => () => void
  containerFlow: (node: MdastNode, info: Record<string, unknown>) => string
}

function readAttr(node: MdastNode, key: string, fallback = '') {
  const value = node[key as keyof MdastNode] ?? node.attributes?.[key]
  return value == null ? fallback : String(value)
}

export const containerRemarkHandlers = {
  callout(node: MdastNode, _: unknown, state: StringifyState, info: Record<string, unknown>) {
    const variant = readAttr(node, 'variant', 'info')
    const exit = state.enter('callout')
    const content = state.containerFlow(node, info)
    exit()
    return `:::callout ${variant}\n${content}\n:::\n`
  },
  toggle(node: MdastNode, _: unknown, state: StringifyState, info: Record<string, unknown>) {
    const title = readAttr(node, 'title', 'Toggle')
    const exit = state.enter('toggle')
    const content = state.containerFlow(node, info)
    exit()
    return `:::toggle ${title}\n${content}\n:::\n`
  },
  column_group(node: MdastNode, _: unknown, state: StringifyState, info: Record<string, unknown>) {
    const count = readAttr(node, 'count', '2')
    const exit = state.enter('column_group')
    const content = state.containerFlow(node, info)
    exit()
    return `:::columns count="${count}"\n${content}\n:::\n`
  },
  column(node: MdastNode, _: unknown, state: StringifyState, info: Record<string, unknown>) {
    const exit = state.enter('column')
    const content = state.containerFlow(node, info)
    exit()
    return `:::column\n${content}\n:::\n`
  },
  database_block(node: MdastNode) {
    const databaseId = readAttr(node, 'databaseId')
    return `:::database id="${databaseId}"\n:::\n`
  },
}
