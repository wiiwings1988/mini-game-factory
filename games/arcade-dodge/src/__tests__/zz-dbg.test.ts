import { describe, it } from "vitest";
import { createGame, feedbackButtonRect } from "../game.js";
import { render } from "../render.js";

class Log {
  fillStyle = "#000"; strokeStyle = "#000"; lineWidth = 1; font = "10px"; textAlign = "left";
  textBaseline = "alphabetic"; globalAlpha = 1;
  calls: any[] = [];
  save(){} restore(){} translate(x:number,y:number){this.calls.push(["translate",x,y])} scale(){}
  clearRect(){} beginPath(){} moveTo(){} lineTo(){} arc(){} closePath(){} fill(){} stroke(){}
  fillRect(x:number,y:number,w:number,h:number){this.calls.push(["fillRect",x,y,w,h,String(this.fillStyle)])}
  strokeRect(x:number,y:number,w:number,h:number){this.calls.push(["strokeRect",x,y,w,h,String(this.strokeStyle)])}
  fillText(t:string,x:number,y:number){this.calls.push(["fillText",t,x,y,this.textAlign,this.textBaseline,String(this.fillStyle),this.font])}
}

describe("dbg", () => {
  it("dump", () => {
    const state = createGame({ width: 320, height: 568, best: 8, seed: 1 });
    const log = new Log();
    render(log as never, state);
    console.log("button", feedbackButtonRect(state));
    for (const c of log.calls) console.log(JSON.stringify(c));
  });
});
