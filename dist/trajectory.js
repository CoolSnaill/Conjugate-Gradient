"use strict";

globalThis.createCgTrajectory = function createCgTrajectory({ names, format, selectStep }) {
  const canvas = document.getElementById("trajectory-graph");
  const ctx = canvas.getContext("2d");
  const axes = document.getElementById("trajectory-axes");
  const note = document.getElementById("trajectory-note");
  const xAxis = document.getElementById("trajectory-x");
  const yAxis = document.getElementById("trajectory-y");
  let data = null;
  let axisX = 0;
  let axisY = 1;
  let current = 0;
  let screenPoints = [];

  function syncAxes() {
    axes.hidden = !data || data.a.length === 2;
    note.hidden = axes.hidden;
    if (axes.hidden) return;
    for (const [select, own, other] of [[xAxis, axisX, axisY], [yAxis, axisY, axisX]]) {
      select.replaceChildren(...names.slice(0, data.a.length).map((name, index) => {
        const option = document.createElement("option");
        option.textContent = name;
        option.value = index;
        option.disabled = index === other;
        return option;
      }));
      select.value = own;
    }
  }

  function setData(result) {
    data = result;
    if (data && (data.a.length === 2 || Math.max(axisX, axisY) >= data.a.length)) {
      axisX = 0;
      axisY = 1;
    }
    syncAxes();
  }

  function draw(iteration = current) {
    current = iteration;
    screenPoints = [];
    canvas.style.cursor = "";
    if (!ctx) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = '11px "IBM Plex Mono", Consolas, monospace';
    canvas.setAttribute("aria-label", "Траектория приближений на линиях уровня");

    function placeholder(text) {
      ctx.fillStyle = "#526174";
      ctx.textAlign = "center";
      ctx.fillText(text, width / 2, height / 2, width - 20);
    }

    if (!data) {
      placeholder("Траектория появится после расчёта");
      return;
    }

    const centerX = data.minimum[axisX];
    const centerY = data.minimum[axisY];
    const history = data.history;
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      placeholder("Координаты минимума вне числового диапазона");
      return;
    }

    const diagonalX = data.a[axisX][axisX];
    const diagonalY = data.a[axisY][axisY];
    const cross = data.a[axisX][axisY];
    const matrixScale = Math.max(diagonalX, diagonalY);
    const a = diagonalX / matrixScale;
    const d = diagonalY / matrixScale;
    const b = cross / matrixScale;
    const angle = Math.atan2(2 * b, a - d) / 2;
    const larger = (a + d + Math.hypot(a - d, 2 * b)) / 2;
    const smaller = (a / larger) * (d - (b / Math.sqrt(a)) ** 2);
    if (!(smaller > 0)) {
      placeholder("Сечение слишком вытянуто для построения линий уровня");
      return;
    }

    const largestCoordinate = Math.max(Math.abs(centerX), Math.abs(centerY),
      ...history.flatMap(({ x }) => [Math.abs(x[axisX]), Math.abs(x[axisY])]));
    const coordinateScale = largestCoordinate || 1;
    function difference(value, center) {
      const delta = value - center;
      return Number.isFinite(delta) ? delta / coordinateScale : value / coordinateScale - center / coordinateScale;
    }
    const points = history.map(({ x }) => [difference(x[axisX], centerX), difference(x[axisY], centerY)]);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const minX = Math.min(0, ...xs);
    const maxX = Math.max(0, ...xs);
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(0, ...ys);
    const left = width < 370 ? 57 : 71;
    const right = width - 13;
    const top = 13;
    const bottom = height - 28;
    if (right <= left || bottom <= top) return;
    const pixelsWide = right - left;
    const pixelsHigh = bottom - top;
    const spread = Math.max((maxX - minX) / pixelsWide, (maxY - minY) / pixelsHigh);
    const visibleUnits = spread > 0 ? 1.32 * spread : 0.6 / Math.min(pixelsWide, pixelsHigh);
    const originX = (right + left) / 2 - ((maxX + minX) / 2) / visibleUnits;
    const originY = (bottom + top) / 2 + ((maxY + minY) / 2) / visibleUnits;
    const px = (x) => originX + x / visibleUnits;
    const py = (y) => originY - y / visibleUnits;

    ctx.strokeStyle = "#e2eaf4";
    ctx.fillStyle = "#516276";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const xTicks = pixelsWide < 330 ? 3 : 5;
    for (let i = 0; i <= xTicks; i++) {
      const x = left + i / xTicks * pixelsWide;
      const value = (centerX / coordinateScale + (x - originX) * visibleUnits) * coordinateScale;
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.textAlign = "center";
      ctx.fillText(format(value), x, bottom + 14, 52);
    }
    for (let i = 0; i <= 4; i++) {
      const y = top + i / 4 * pixelsHigh;
      const value = (centerY / coordinateScale + (originY - y) * visibleUnits) * coordinateScale;
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.textAlign = "right";
      ctx.fillText(format(value), left - 6, y + 4, left - 8);
    }
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(names[axisX], right, height - 2);
    ctx.fillText(names[axisY], 15, 11);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, pixelsWide, pixelsHigh);
    ctx.clip();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rootLarge = Math.sqrt(larger);
    const rootSmall = Math.sqrt(smaller);
    const maxRadius = Math.max(...[left, right].flatMap((x) => [top, bottom].map((y) => {
      const dx = x - originX;
      const dy = originY - y;
      return Math.hypot(rootLarge * (cos * dx + sin * dy), rootSmall * (cos * dy - sin * dx));
    })));
    ctx.strokeStyle = "#668fbe";
    ctx.lineWidth = 1;
    for (let level = 1; level <= 10; level++) {
      const radius = maxRadius * (level / 11) ** 1.25;
      ctx.beginPath();
      ctx.ellipse(originX, originY, radius / rootLarge, radius / rootSmall, -angle, 0, 2 * Math.PI);
      ctx.stroke();
    }

    screenPoints = points.map(([x, y]) => [px(x), py(y)]);
    canvas.style.cursor = "pointer";
    function path(from, to, color, dash) {
      if (from === to) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(...screenPoints[from]);
      for (let index = from + 1; index <= to; index++) ctx.lineTo(...screenPoints[index]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    path(current, screenPoints.length - 1, "#a596cf", [4, 4]);
    path(0, current, "#6742cf", []);

    function dot(x, y, radius, color, border = "#fff") {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = border;
      ctx.stroke();
    }

    for (let k = 1; k < screenPoints.length; k++) {
      if (k !== current && (screenPoints.length <= 35 || k < 10)) {
        dot(...screenPoints[k], 3, k <= current ? "#6742cf" : "#ad9cda");
      }
    }
    const [startX, startY] = screenPoints[0];
    dot(startX, startY, 4.5, "#fff", "#5a748f");
    ctx.fillStyle = "#138574";
    ctx.beginPath();
    ctx.moveTo(originX, originY - 6);
    ctx.lineTo(originX + 6, originY);
    ctx.lineTo(originX, originY + 6);
    ctx.lineTo(originX - 6, originY);
    ctx.closePath();
    ctx.fill();
    const [currentX, currentY] = screenPoints[current];
    if (current > 0 && Math.hypot(currentX - originX, currentY - originY) > 7) {
      dot(currentX, currentY, 4.2, "#6742cf");
    }
    ctx.fillStyle = "#6742cf24";
    ctx.beginPath();
    ctx.arc(currentX, currentY, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#6742cf";
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.restore();

    function annotate(text, x, y, color) {
      ctx.textAlign = x > right - 33 ? "right" : "left";
      ctx.fillStyle = color;
      ctx.fillText(text, x + (ctx.textAlign === "right" ? -9 : 9), y);
    }
    annotate("x₀", startX, Math.min(bottom - 2, startY + 16), "#455d78");
    annotate("x*", originX, Math.max(top + 10, originY - 10), "#096d5e");
    const values = history[current].x;
    canvas.setAttribute("aria-label",
      `Итерация ${current}. ${names[axisX]} = ${format(values[axisX])}, ${names[axisY]} = ${format(values[axisY])}. Центр линий уровня: ${format(centerX)}, ${format(centerY)}.`);
  }

  xAxis.addEventListener("change", () => { axisX = Number(xAxis.value); syncAxes(); draw(); });
  yAxis.addEventListener("change", () => { axisY = Number(yAxis.value); syncAxes(); draw(); });
  canvas.addEventListener("click", (event) => {
    const { left, top } = canvas.getBoundingClientRect();
    let nearest = -1;
    let distance = 15;
    screenPoints.forEach(([x, y], index) => {
      const candidate = Math.hypot(event.clientX - left - x, event.clientY - top - y);
      if (candidate < distance || (candidate === distance && index === current)) {
        nearest = index;
        distance = candidate;
      }
    });
    if (nearest >= 0) selectStep(nearest);
  });
  new ResizeObserver(() => draw()).observe(canvas);
  return { setData, draw };
};
