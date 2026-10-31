/**
 * The renderer contract games draw against.
 *
 * It is a deliberately small subset of CanvasRenderingContext2D, because that
 * subset exists identically in browsers and in WeChat's mini game canvas. A
 * headless implementation lets tests and CI "render" without a GPU or DOM.
 */
export interface Canvas2DLike {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: "left" | "center" | "right";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic";
  globalAlpha: number;

  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
}

/** Records draw calls; used by tests to assert "something was drawn". */
export class RecordingRenderer implements Canvas2DLike {
  fillStyle = "#000";
  strokeStyle = "#000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: "left" | "center" | "right" = "left";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" = "alphabetic";
  globalAlpha = 1;

  readonly calls: string[] = [];
  readonly texts: string[] = [];

  private record(name: string): void {
    this.calls.push(name);
  }

  save(): void { this.record("save"); }
  restore(): void { this.record("restore"); }
  translate(): void { this.record("translate"); }
  scale(): void { this.record("scale"); }
  clearRect(): void { this.record("clearRect"); }
  fillRect(): void { this.record("fillRect"); }
  strokeRect(): void { this.record("strokeRect"); }
  beginPath(): void { this.record("beginPath"); }
  moveTo(): void { this.record("moveTo"); }
  lineTo(): void { this.record("lineTo"); }
  arc(): void { this.record("arc"); }
  closePath(): void { this.record("closePath"); }
  fill(): void { this.record("fill"); }
  stroke(): void { this.record("stroke"); }

  fillText(text: string): void {
    this.texts.push(text);
    this.record("fillText");
  }
}
