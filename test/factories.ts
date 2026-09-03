import { newId } from '../src/document/model/ids';
import type {
  LineObject,
  PenStroke,
  ShapeObject,
  TextObject,
} from '../src/document/model/types';

export function pen(overrides: Partial<PenStroke> = {}): PenStroke {
  return {
    id: newId(),
    type: 'pen',
    z: 1,
    points: [
      { x: 0, y: 0, p: 0.5 },
      { x: 10, y: 10, p: 0.5 },
      { x: 20, y: 0, p: 0.5 },
    ],
    color: '#18181B',
    size: 4,
    ...overrides,
  };
}

export function shape(overrides: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id: newId(),
    type: 'shape',
    z: 1,
    kind: 'rectangle',
    frame: { x: 0, y: 0, w: 100, h: 60 },
    rotation: 0,
    fill: null,
    stroke: '#18181B',
    size: 2,
    text: '',
    textColor: '#18181B',
    fontSize: 20,
    ...overrides,
  };
}

export function line(overrides: Partial<LineObject> = {}): LineObject {
  return {
    id: newId(),
    type: 'line',
    z: 1,
    a: { x: 0, y: 0 },
    b: { x: 100, y: 100 },
    color: '#18181B',
    size: 2,
    style: 'solid',
    startArrow: 'none',
    endArrow: 'arrow',
    ...overrides,
  };
}

export function text(overrides: Partial<TextObject> = {}): TextObject {
  return {
    id: newId(),
    type: 'text',
    z: 1,
    at: { x: 0, y: 0 },
    width: 200,
    text: 'Hello',
    color: '#18181B',
    fontFamily: 'sans',
    fontSize: 20,
    fontWeight: 500,
    italic: false,
    underline: false,
    align: 'left',
    ...overrides,
  };
}
