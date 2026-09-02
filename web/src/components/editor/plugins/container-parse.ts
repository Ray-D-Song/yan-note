export type ContainerBlock = {
  type: string
  attrs: Record<string, string>
  bodyLines: string[]
}

const OPEN_LINE_PATTERN = /^:::(\w+)(?:\s+(.*))?$/

function parseOpeningAttrs(type: string, attrPart: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {}
  if (!attrPart) {
    return attrs
  }

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

  return attrs
}

export function parseContainerBlocks(source: string): ContainerBlock[] {
  const lines = source.split('\n')
  const blocks: ContainerBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const match = line.match(OPEN_LINE_PATTERN)
    if (!match?.[1]) {
      index += 1
      continue
    }

    const type = match[1]
    const attrs = parseOpeningAttrs(type, match[2])
    index += 1

    const bodyLines: string[] = []
    let depth = 1

    while (index < lines.length && depth > 0) {
      const currentLine = lines[index] ?? ''

      if (currentLine === ':::') {
        depth -= 1
        if (depth > 0) {
          bodyLines.push(currentLine)
        }
        index += 1
        continue
      }

      const nestedOpen = currentLine.match(OPEN_LINE_PATTERN)
      if (nestedOpen?.[1]) {
        depth += 1
        bodyLines.push(currentLine)
        index += 1
        continue
      }

      bodyLines.push(currentLine)
      index += 1
    }

    blocks.push({ type, attrs, bodyLines })
  }

  return blocks
}
