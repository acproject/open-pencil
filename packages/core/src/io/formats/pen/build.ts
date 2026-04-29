import type { Vector } from '@open-pencil/core/types'
import type {
  Color,
  Effect,
  Fill,
  LayoutMode,
  SceneGraph,
  SceneNode,
  Stroke
} from '@open-pencil/core/scene-graph'

import type { PenDocument, PenNode, PenVariable } from './convert'

function colorToString(color: Color): string {
  const r = Math.round(color.r * 255)
    .toString(16)
    .padStart(2, '0')
  const g = Math.round(color.g * 255)
    .toString(16)
    .padStart(2, '0')
  const b = Math.round(color.b * 255)
    .toString(16)
    .padStart(2, '0')
  const a = Math.round(color.a * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${r}${g}${b}${a}`
}

function convertFillToPen(fills: Fill[]): string | null {
  if (fills.length === 0) return null
  const fill = fills[0]
  if (fill.type !== 'SOLID') return null
  if (!fill.visible) return null
  const color = { ...fill.color, a: fill.opacity }
  return colorToString(color)
}

function convertStrokeToPen(stroke: Stroke): { fill: string; align: 'inside' | 'center' | 'outside'; thickness: number } | null {
  if (!stroke.visible) return null
  return {
    fill: colorToString(stroke.color),
    align: stroke.align === 'INSIDE' ? 'inside' : (stroke.align === 'OUTSIDE' ? 'outside' : 'center'),
    thickness: stroke.weight
  }
}

interface PenEffect {
  type: string
  color: string
  offset: Vector
  blur: number
  spread: number
}

function convertEffectsToPen(effects: Effect[]): PenEffect[] | null {
  if (effects.length === 0) return null
  return effects
    .filter((e) => e.visible && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'))
    .map((e) => ({
      type: 'shadow',
      shadowType: e.type === 'INNER_SHADOW' ? 'inner' : 'outer',
      color: colorToString(e.color),
      offset: e.offset,
      blur: e.radius,
      spread: e.spread
    }))
}

function convertCornerRadius(node: SceneNode): number | number[] | undefined {
  if (node.independentCorners) {
    return [
      node.topLeftRadius,
      node.topRightRadius,
      node.bottomRightRadius,
      node.bottomLeftRadius
    ]
  }
  return node.cornerRadius
}

function convertPadding(node: SceneNode): number | number[] | undefined {
  const top = node.paddingTop
  const right = node.paddingRight
  const bottom = node.paddingBottom
  const left = node.paddingLeft
  if (top === right && right === bottom && bottom === left) {
    return top === 0 ? undefined : top
  }
  return [top, right, bottom, left]
}

function mapLayoutModeToPen(layoutMode: LayoutMode): string {
  if (layoutMode === 'HORIZONTAL') return 'row'
  if (layoutMode === 'VERTICAL') return 'column'
  return 'none'
}

function mapNodeTypeToPen(type: string): string {
  switch (type) {
    case 'COMPONENT':
    case 'COMPONENT_SET':
      return 'frame'
    case 'FRAME':
      return 'frame'
    case 'RECTANGLE':
      return 'rectangle'
    case 'ELLIPSE':
      return 'ellipse'
    case 'TEXT':
      return 'text'
    case 'VECTOR':
      return 'path'
    case 'INSTANCE':
      return 'ref'
    default:
      return 'frame'
  }
}

// eslint-disable-next-line complexity -- handles many node properties
function sceneNodeToPenNode(node: SceneNode, graph: SceneGraph, componentMap: Map<string, string>): PenNode {
  const penNode: PenNode = {
    type: mapNodeTypeToPen(node.type),
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    opacity: node.opacity !== 1 ? node.opacity : undefined,
    enabled: !node.visible ? false : undefined,
    clip: node.clipsContent || undefined,
    rotation: node.rotation !== 0 ? node.rotation : undefined,
    flipX: node.flipX || undefined,
    flipY: node.flipY || undefined,
    reusable: node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || undefined,
    cornerRadius: undefined,
    stroke: undefined,
    effect: undefined,
    layout: undefined,
    gap: undefined,
    padding: undefined,
    justifyContent: undefined,
    alignItems: undefined,
    children: undefined,
    content: undefined,
    fontFamily: undefined,
    fontSize: undefined,
    fontWeight: undefined,
    lineHeight: undefined,
    letterSpacing: undefined,
    textAlign: undefined,
    textAlignVertical: undefined,
    textGrowth: undefined,
    ref: undefined,
    descendants: undefined,
    slot: undefined,
    geometry: undefined,
    iconFontName: undefined,
    iconFontFamily: undefined,
    weight: undefined,
    model: undefined,
    theme: undefined
  }

  const fillStr = convertFillToPen(node.fills)
  if (fillStr) penNode.fill = fillStr

  if (node.strokes.length > 0) {
    const stroke = convertStrokeToPen(node.strokes[0])
    if (stroke) penNode.stroke = stroke
  }

  const effects = convertEffectsToPen(node.effects)
  if (effects && effects.length > 0) penNode.effect = effects

  const cornerRadius = convertCornerRadius(node)
  if (cornerRadius !== undefined) penNode.cornerRadius = cornerRadius

  const padding = convertPadding(node)
  if (padding !== undefined) penNode.padding = padding

  if (node.layoutMode !== 'NONE') {
    penNode.layout = mapLayoutModeToPen(node.layoutMode)
    penNode.gap = node.itemSpacing !== 0 ? node.itemSpacing : undefined
    penNode.justifyContent =
      node.primaryAxisAlign !== 'MIN' ? node.primaryAxisAlign.toLowerCase() : undefined
    penNode.alignItems =
      node.counterAxisAlign !== 'MIN' ? node.counterAxisAlign.toLowerCase() : undefined
  }

  if (node.type === 'TEXT' && node.text) {
    penNode.content = node.text
    penNode.fontFamily = node.fontFamily
    penNode.fontSize = node.fontSize
    penNode.fontWeight = node.fontWeight && node.fontWeight !== 400 ? node.fontWeight : undefined
    penNode.lineHeight = node.lineHeight ?? undefined
    penNode.letterSpacing = node.letterSpacing !== 0 ? node.letterSpacing : undefined
    penNode.textAlign =
      node.textAlignHorizontal !== 'LEFT' ? node.textAlignHorizontal.toLowerCase() : undefined
    penNode.textAlignVertical =
      node.textAlignVertical !== 'TOP' ? node.textAlignVertical.toLowerCase() : undefined
  }

  if (node.type === 'INSTANCE' && node.componentId) {
    const compId = componentMap.get(node.componentId) ?? node.componentId
    penNode.ref = compId
  }

  if (node.childIds.length > 0) {
    penNode.children = node.childIds
      .map((childId) => {
        const child = graph.getNode(childId)
        return child ? sceneNodeToPenNode(child, graph, componentMap) : null
      })
      .filter((c): c is PenNode => c !== null)
  }

  return penNode
}

function buildVariables(graph: SceneGraph): { variables: Record<string, PenVariable>; themes: Record<string, string[]> } | undefined {
  if (graph.variableCollections.size === 0) return undefined

  const variables: Record<string, PenVariable> = {}
  const themeSet = new Set<string>()

  for (const [, collection] of graph.variableCollections) {
    for (const varId of collection.variableIds) {
      const variable = graph.variables.get(varId)
      if (!variable) continue

      const penVar: PenVariable = {
        type: variable.type === 'COLOR' ? 'color' : (variable.type === 'FLOAT' ? 'number' : 'string'),
        value: []
      }

      const values: Array<{ value: string | number; theme?: Record<string, string> }> = []

      for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
        const mode = collection.modes.find((m) => m.modeId === modeId)
        if (!mode) continue

        let penValue: string | number
        if (typeof value === 'object' && 'r' in value) {
          penValue = colorToString(value)
        } else {
          penValue = value as string | number
        }

        const themeEntry = { value: penValue, theme: { theme: mode.name } }
        values.push(themeEntry)

        themeSet.add(mode.name)
      }

      penVar.value = values
      variables[variable.name] = penVar
    }
  }

  if (Object.keys(variables).length === 0) return undefined

  return { variables, themes: { theme: Array.from(themeSet) } }
}

export function buildPenFile(graph: SceneGraph, pageId?: string): string {
  const pages = graph.getPages(true)
  const targetPage = pageId
    ? graph.getNode(pageId)
    : (pages.length > 0 ? pages[0] : null)

  if (!targetPage) {
    return JSON.stringify({
      version: '1.0',
      children: []
    })
  }

  const componentMap = new Map<string, string>()
  for (const node of graph.getAllNodes()) {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      componentMap.set(node.id, node.id)
    }
  }

  const children: PenNode[] = []
  const childIds = targetPage.childIds

  for (const childId of childIds) {
    const child = graph.getNode(childId)
    if (child) {
      children.push(sceneNodeToPenNode(child, graph, componentMap))
    }
  }

  const doc: PenDocument = {
    version: '1.0',
    children
  }

  const varData = buildVariables(graph)
  if (varData) {
    doc.variables = varData.variables
    doc.themes = varData.themes
  }

  return JSON.stringify(doc, null, 2)
}
