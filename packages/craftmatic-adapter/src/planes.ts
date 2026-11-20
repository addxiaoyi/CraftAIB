export type Direction = 'west' | 'east' | 'down' | 'up' | 'north' | 'south';
type Corner = [number, number, number];
type Plane = { tangents: [Corner, Corner]; offset: Corner };

export const SIDES: Direction[] = ['west', 'east', 'down', 'up', 'north', 'south'];

export const SIDE_VECTORS: Record<Direction, Corner> = { west: [-1, 0, 0], east: [1, 0, 0], down: [0, -1, 0], up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1] };

export const PLANES: Record<Direction, Plane> = {
  up: { tangents: [[1, 0, 0], [0, 0, 1]], offset: [0, 1, 0] },
  down: { tangents: [[1, 0, 0], [0, 0, -1]], offset: [0, 0, 1] },
  north: { tangents: [[1, 0, 0], [0, 1, 0]], offset: [0, 0, 0] },
  south: { tangents: [[-1, 0, 0], [0, 1, 0]], offset: [1, 0, 0] },
  west: { tangents: [[0, 0, 1], [0, 1, 0]], offset: [0, 0, 0] },
  east: { tangents: [[0, 0, -1], [0, 1, 0]], offset: [1, 0, 1] },
};

export const CORNER_UV: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
