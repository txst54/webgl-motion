/**
 * CanvasBounds.ts
 * Defines the bounds of a canvas subsection in a 2D space.
 * Since the canvas origin is at the bottom-left, x and y represent the bottom-left corner
 */
export interface CanvasBounds {
  width: number;
  height: number;
  x: number; // bottom-left x
  y: number; // bottom-left y
}