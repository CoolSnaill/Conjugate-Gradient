"use strict";

globalThis.loadCgSolver = async function loadCgSolver(encoded) {
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(bytes);
  const { memory, cgsolve_, __heap_base } = instance.exports;

  return function solve({ n, limit, tolerance, a, b, x0 }) {
    let cursor = __heap_base.value;
    function reserve(count, width = 8) {
      cursor = Math.ceil(cursor / width) * width;
      const offset = cursor;
      cursor += count * width;
      return offset;
    }

    const nAt = reserve(1, 4);
    const limitAt = reserve(1, 4);
    const stepsAt = reserve(1, 4);
    const toleranceAt = reserve(1);
    const thresholdAt = reserve(1);
    const aAt = reserve(n * n);
    const bAt = reserve(n);
    const x0At = reserve(n);
    const minimumAt = reserve(n);
    const xHistoryAt = reserve(n * (limit + 1));
    const normAt = reserve(limit + 1);
    const alphaAt = reserve(limit + 1);
    const betaAt = reserve(limit + 1);

    const pageSize = 65536;
    if (cursor > memory.buffer.byteLength) {
      memory.grow(Math.ceil((cursor - memory.buffer.byteLength) / pageSize));
    }
    const data = new DataView(memory.buffer);
    data.setInt32(nAt, n, true);
    data.setInt32(limitAt, limit, true);
    data.setFloat64(toleranceAt, tolerance, true);
    const doubles = (address, count) => new Float64Array(memory.buffer, address, count);
    const matrix = doubles(aAt, n * n);
    for (let col = 0; col < n; col++) {
      for (let row = 0; row < n; row++) {
        matrix[col * n + row] = a[row][col];
      }
    }
    doubles(bAt, n).set(b);
    doubles(x0At, n).set(x0);

    const status = cgsolve_(nAt, limitAt, toleranceAt, aAt, bAt, x0At, xHistoryAt,
      normAt, alphaAt, betaAt, stepsAt, thresholdAt, minimumAt);
    if (status < 0) return { status, history: [] };

    const steps = data.getInt32(stepsAt, true);
    const norms = doubles(normAt, steps + 1);
    const alphas = doubles(alphaAt, steps + 1);
    const betas = doubles(betaAt, steps + 1);
    const history = Array.from({ length: steps + 1 }, (_, k) => ({
      x: Array.from(doubles(xHistoryAt + k * n * 8, n)),
      norm: norms[k],
      alpha: k > 0 ? alphas[k] : null,
      beta: k > 0 && k < steps ? betas[k] : null,
    }));
    return {
      status,
      threshold: data.getFloat64(thresholdAt, true),
      minimum: Array.from(doubles(minimumAt, n)),
      history,
    };
  };
};
