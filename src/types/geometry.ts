/**
 * Declarative Geometry Specification and Validation
 *
 * Provides safe, structured schemas for interactive STEM geometry (JSXGraph)
 * without arbitrary JavaScript or executable code.
 */

export type GeometryBoundingBox = [number, number, number, number]; // [minX, maxY, maxX, minY]

export interface GeometryPointElement {
  kind: 'point';
  id?: string;
  name?: string;
  coords: [number, number];
  color?: string;
  size?: number;
  fixed?: boolean;
  visible?: boolean;
}

export interface GeometryLineElement {
  kind: 'line' | 'segment';
  id?: string;
  name?: string;
  point1: string | [number, number];
  point2: string | [number, number];
  color?: string;
  strokeWidth?: number;
  dash?: number;
  visible?: boolean;
}

export interface GeometryCircleElement {
  kind: 'circle';
  id?: string;
  name?: string;
  center: string | [number, number];
  radius?: number;
  pointOnCircle?: string | [number, number];
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  visible?: boolean;
}

export interface GeometryPolygonElement {
  kind: 'polygon';
  id?: string;
  name?: string;
  vertices: (string | [number, number])[];
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  visible?: boolean;
}

export interface GeometryVectorElement {
  kind: 'vector';
  id?: string;
  name?: string;
  point1: string | [number, number];
  point2: string | [number, number];
  color?: string;
  strokeWidth?: number;
  visible?: boolean;
}

export interface GeometryFunctionElement {
  kind: 'functiongraph';
  id?: string;
  name?: string;
  fn: string;
  color?: string;
  strokeWidth?: number;
  dash?: number;
  min?: number;
  max?: number;
  visible?: boolean;
}

export interface GeometryCurveElement {
  kind: 'curve';
  id?: string;
  name?: string;
  dataX: number[];
  dataY: number[];
  color?: string;
  strokeWidth?: number;
  dash?: number;
  visible?: boolean;
}

export interface GeometrySliderElement {
  kind: 'slider';
  id?: string;
  name: string;
  point1: [number, number];
  point2: [number, number];
  range: [number, number, number]; // [min, initial, max]
  visible?: boolean;
}

export interface GeometryTextElement {
  kind: 'text';
  id?: string;
  text: string;
  coords: [number, number];
  fontSize?: number;
  color?: string;
  visible?: boolean;
}

export type GeometryElement =
  | GeometryPointElement
  | GeometryLineElement
  | GeometryCircleElement
  | GeometryPolygonElement
  | GeometryVectorElement
  | GeometryFunctionElement
  | GeometryCurveElement
  | GeometrySliderElement
  | GeometryTextElement;

export interface GeometrySpec {
  title?: string;
  description?: string;
  boundingBox?: GeometryBoundingBox;
  axis?: boolean;
  grid?: boolean;
  showNavigation?: boolean;
  keepAspectRatio?: boolean;
  elements: GeometryElement[];
}

export type RawJsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | RawJsonValue[]
  | { [key: string]: RawJsonValue };

function isPointCoord(c: RawJsonValue): c is [number, number] {
  return Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' && typeof c[1] === 'number';
}

function isPointRef(ref: RawJsonValue): ref is string | [number, number] {
  return typeof ref === 'string' || isPointCoord(ref);
}

/**
 * Validates a parsed JSON object against the strict declarative geometry schema.
 */
export function validateGeometrySpec(
  data: RawJsonValue | GeometrySpec,
): { valid: true; spec: GeometrySpec } | { valid: false; error: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Geometry specification must be a non-null JSON object' };
  }

  const obj = data as Record<string, RawJsonValue>;

  if (!Array.isArray(obj.elements)) {
    return { valid: false, error: "Geometry specification must contain an 'elements' array" };
  }

  let boundingBox: GeometryBoundingBox | undefined = undefined;
  if (obj.boundingBox !== undefined) {
    if (
      !Array.isArray(obj.boundingBox) ||
      obj.boundingBox.length !== 4 ||
      obj.boundingBox.some((n) => typeof n !== 'number')
    ) {
      return {
        valid: false,
        error: "Invalid boundingBox: must be a 4-number array [minX, maxY, maxX, minY]",
      };
    }
    boundingBox = obj.boundingBox as GeometryBoundingBox;
  }

  const validatedElements: GeometryElement[] = [];

  for (let i = 0; i < obj.elements.length; i++) {
    const el = obj.elements[i];
    if (!el || typeof el !== 'object') {
      return { valid: false, error: `Element at index ${i} must be an object` };
    }

    const item = el as Record<string, RawJsonValue>;
    const kind = item.kind;

    if (typeof kind !== 'string') {
      return { valid: false, error: `Element at index ${i} is missing a valid 'kind'` };
    }

    switch (kind) {
      case 'point': {
        if (!isPointCoord(item.coords)) {
          return { valid: false, error: `Point at index ${i} must have 2-element numeric 'coords'` };
        }
        validatedElements.push({
          kind: 'point',
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          coords: item.coords,
          color: typeof item.color === 'string' ? item.color : undefined,
          size: typeof item.size === 'number' ? item.size : undefined,
          fixed: typeof item.fixed === 'boolean' ? item.fixed : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'line':
      case 'segment': {
        if (!isPointRef(item.point1) || !isPointRef(item.point2)) {
          return {
            valid: false,
            error: `${kind} at index ${i} requires valid point1 and point2 references or coordinates`,
          };
        }
        validatedElements.push({
          kind,
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          point1: item.point1,
          point2: item.point2,
          color: typeof item.color === 'string' ? item.color : undefined,
          strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : undefined,
          dash: typeof item.dash === 'number' ? item.dash : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'circle': {
        if (!isPointRef(item.center)) {
          return { valid: false, error: `Circle at index ${i} requires a valid 'center' point or coordinates` };
        }
        if (typeof item.radius !== 'number' && !isPointRef(item.pointOnCircle)) {
          return { valid: false, error: `Circle at index ${i} requires either 'radius' or 'pointOnCircle'` };
        }
        validatedElements.push({
          kind: 'circle',
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          center: item.center,
          radius: typeof item.radius === 'number' ? item.radius : undefined,
          pointOnCircle: isPointRef(item.pointOnCircle) ? item.pointOnCircle : undefined,
          color: typeof item.color === 'string' ? item.color : undefined,
          fillColor: typeof item.fillColor === 'string' ? item.fillColor : undefined,
          fillOpacity: typeof item.fillOpacity === 'number' ? item.fillOpacity : undefined,
          strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'polygon': {
        if (!Array.isArray(item.vertices) || item.vertices.length < 3 || !item.vertices.every(isPointRef)) {
          return { valid: false, error: `Polygon at index ${i} requires an array of at least 3 vertices` };
        }
        validatedElements.push({
          kind: 'polygon',
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          vertices: item.vertices,
          color: typeof item.color === 'string' ? item.color : undefined,
          fillColor: typeof item.fillColor === 'string' ? item.fillColor : undefined,
          fillOpacity: typeof item.fillOpacity === 'number' ? item.fillOpacity : undefined,
          strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'vector': {
        if (!isPointRef(item.point1) || !isPointRef(item.point2)) {
          return { valid: false, error: `Vector at index ${i} requires valid point1 and point2` };
        }
        validatedElements.push({
          kind: 'vector',
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          point1: item.point1,
          point2: item.point2,
          color: typeof item.color === 'string' ? item.color : undefined,
          strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'functiongraph': {
        if (typeof item.fn !== 'string' || !item.fn.trim()) {
          return { valid: false, error: `Functiongraph at index ${i} requires a non-empty 'fn' formula string` };
        }
        validatedElements.push({
          kind: 'functiongraph',
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          fn: item.fn.trim(),
          color: typeof item.color === 'string' ? item.color : undefined,
          strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : undefined,
          dash: typeof item.dash === 'number' ? item.dash : undefined,
          min: typeof item.min === 'number' ? item.min : undefined,
          max: typeof item.max === 'number' ? item.max : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'curve': {
        if (
          !Array.isArray(item.dataX) ||
          !Array.isArray(item.dataY) ||
          item.dataX.length !== item.dataY.length ||
          item.dataX.some((n) => typeof n !== 'number') ||
          item.dataY.some((n) => typeof n !== 'number')
        ) {
          return {
            valid: false,
            error: `Curve at index ${i} requires matching numeric dataX and dataY arrays`,
          };
        }
        validatedElements.push({
          kind: 'curve',
          id: typeof item.id === 'string' ? item.id : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          dataX: item.dataX as number[],
          dataY: item.dataY as number[],
          color: typeof item.color === 'string' ? item.color : undefined,
          strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : undefined,
          dash: typeof item.dash === 'number' ? item.dash : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'slider': {
        if (typeof item.name !== 'string' || !item.name.trim()) {
          return { valid: false, error: `Slider at index ${i} requires a name` };
        }
        if (!isPointCoord(item.point1) || !isPointCoord(item.point2)) {
          return { valid: false, error: `Slider at index ${i} requires point1 and point2 coordinates` };
        }
        if (
          !Array.isArray(item.range) ||
          item.range.length !== 3 ||
          item.range.some((n) => typeof n !== 'number')
        ) {
          return { valid: false, error: `Slider at index ${i} requires a 3-number range [min, initial, max]` };
        }
        validatedElements.push({
          kind: 'slider',
          id: typeof item.id === 'string' ? item.id : undefined,
          name: item.name.trim(),
          point1: item.point1,
          point2: item.point2,
          range: item.range as [number, number, number],
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      case 'text': {
        if (typeof item.text !== 'string') {
          return { valid: false, error: `Text element at index ${i} requires 'text'` };
        }
        if (!isPointCoord(item.coords)) {
          return { valid: false, error: `Text element at index ${i} requires numeric 'coords' [x, y]` };
        }
        validatedElements.push({
          kind: 'text',
          id: typeof item.id === 'string' ? item.id : undefined,
          text: item.text,
          coords: item.coords,
          fontSize: typeof item.fontSize === 'number' ? item.fontSize : undefined,
          color: typeof item.color === 'string' ? item.color : undefined,
          visible: typeof item.visible === 'boolean' ? item.visible : undefined,
        });
        break;
      }

      default:
        return { valid: false, error: `Unsupported geometry element kind '${kind}' at index ${i}` };
    }
  }

  return {
    valid: true,
    spec: {
      title: typeof obj.title === 'string' ? obj.title : undefined,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      boundingBox,
      axis: typeof obj.axis === 'boolean' ? obj.axis : true,
      grid: typeof obj.grid === 'boolean' ? obj.grid : true,
      showNavigation: typeof obj.showNavigation === 'boolean' ? obj.showNavigation : false,
      keepAspectRatio: typeof obj.keepAspectRatio === 'boolean' ? obj.keepAspectRatio : false,
      elements: validatedElements,
    },
  };
}

