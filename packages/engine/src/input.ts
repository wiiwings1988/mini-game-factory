/**
 * Pointer input normalised across desktop mouse, mobile touch and WeChat touch
 * events. Coordinates are already in game (canvas) space.
 */
export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly justDown: boolean;
  readonly justUp: boolean;
}

export interface InputState {
  readonly pointer: PointerState;
  /** Monotonic frame counter; useful for "did the player do anything" checks. */
  readonly frame: number;
}

const EMPTY_POINTER: PointerState = {
  x: 0,
  y: 0,
  down: false,
  justDown: false,
  justUp: false,
};

export class InputTracker {
  private x = 0;
  private y = 0;
  private down = false;
  private justDown = false;
  private justUp = false;
  private frame = 0;

  move(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  downAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    if (!this.down) this.justDown = true;
    this.down = true;
  }

  upAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    if (this.down) this.justUp = true;
    this.down = false;
  }

  cancel(): void {
    this.down = false;
  }

  /** Call once per rendered frame, after the update step consumed the edges. */
  endFrame(): void {
    this.justDown = false;
    this.justUp = false;
    this.frame += 1;
  }

  snapshot(): InputState {
    return {
      pointer: this.down === EMPTY_POINTER.down && this.x === 0 && this.y === 0 && !this.justDown && !this.justUp
        ? EMPTY_POINTER
        : {
            x: this.x,
            y: this.y,
            down: this.down,
            justDown: this.justDown,
            justUp: this.justUp,
          },
      frame: this.frame,
    };
  }
}

export const emptyInput = (): InputState => ({ pointer: EMPTY_POINTER, frame: 0 });
