import { describe, expect, it } from "vitest";
import { Rng, hashString } from "../rng.js";

describe("Rng", () => {
  it("is deterministic for the same numeric seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("is deterministic for the same string seed and differs across seeds", () => {
    const a = Array.from({ length: 3 }, () => new Rng("run-1"));
    expect(a[0]?.next()).toBe(a[1]?.next());
    expect(new Rng("run-1").next()).not.toBe(new Rng("run-2").next());
  });

  it("keeps next() inside [0, 1)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() is inclusive on both ends", () => {
    const rng = new Rng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it("handles a zero seed without collapsing to a constant stream", () => {
    const rng = new Rng(0);
    const values = new Set([rng.next(), rng.next(), rng.next()]);
    expect(values.size).toBe(3);
  });

  it("hashes strings stably", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
});
