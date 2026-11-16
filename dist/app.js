"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const form = byId("setup");
  const matrix = byId("matrix-a");
  const rhs = byId("vector-b");
  const initial = byId("vector-x");
  const example = byId("example");
  const slider = byId("iteration");
  const playButton = byId("play");
  const canvas = byId("graph");
  const ctx = canvas.getContext("2d");
  const sizes = [...document.querySelectorAll("[data-size]")];
  const scales = [...document.querySelectorAll("[data-scale]")];
  const graphs = [...document.querySelectorAll("[data-graph]")];
  const names = ["x₁", "x₂", "x₃", "x₄", "x₅", "x₆"];
  const examples = {
    poisson: {
      a: [[2, -1, 0, 0], [-1, 2, -1, 0], [0, -1, 2, -1], [0, 0, -1, 2]],
      b: [1, 0, 2, 1],
    },
    simple: { a: [[4, 1], [1, 3]], b: [1, 2] },
    dense: { a: [[6, 2, 1], [2, 5, 2], [1, 2, 4]], b: [3, 7, 1] },
    scale: {
      a: [1, 4, 12, 35, 90, 240].map((value, i, values) =>
        values.map((_, j) => i === j ? value : 0)),
      b: [1, 1, 1, 1, 1, 1],
    },
  };
  const invalidSystem = {
    [-1]: "Матрица A должна быть симметричной: Aᵢⱼ = Aⱼᵢ.",
    [-2]: "Матрица A должна быть положительно определённой.",
    [-3]: "Проверьте числовые значения и параметры системы.",
  };

  let solve;
  let dimension = 4;
  let result = null;
  let current = 0;
  let timer = null;
  let plot = null;
  let scale = "log";
  let graph = "trajectory";
  const trajectory = createCgTrajectory({
    names,
    format,
    selectStep(index) { pause(); selectStep(index); },
  });

  function field(value, label, diagonal = false) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.value = value;
    input.setAttribute("aria-label", label);
    input.classList.toggle("diagonal", diagonal);
    return input;
  }

  function fill(a, b, x0) {
    dimension = b.length;
    matrix.style.setProperty("--cols", dimension);
    initial.style.setProperty("--cols", dimension);
    matrix.replaceChildren(...a.flatMap((row, i) => row.map((value, j) =>
      field(value, `Матрица A, строка ${i + 1}, столбец ${j + 1}`, i === j))));
    rhs.replaceChildren(...b.map((value, i) => field(value, `Вектор b, элемент ${i + 1}`)));
    initial.replaceChildren(...x0.map((value, i) => field(value, `Начальное приближение, элемент ${i + 1}`)));
    sizes.forEach((button) => button.setAttribute("aria-pressed", Number(button.dataset.size) === dimension));
  }

  function useExample(key) {
    const { a, b } = examples[key];
    fill(a, b, b.map(() => 0));
    clearValidation();
    if (solve) form.requestSubmit();
  }

  function clearValidation() {
    byId("form-error").hidden = true;
    form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
  }

  function setStatus(message, tone = "") {
    byId("result-status").className = `status ${tone}`;
    byId("result-status").lastElementChild.textContent = message;
  }

  function markEdited() {
    clearValidation();
    pause();
    if (solve) setStatus(result ? "Данные изменены" : "Готов к расчёту", result ? "warning" : "");
  }

  function showError(message, input) {
    byId("form-error").textContent = message;
    byId("form-error").hidden = false;
    if (input) {
      if (initial.contains(input)) initial.closest("details").open = true;
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
  }

  function numeric(input) {
    const text = input.value.trim().replaceAll("−", "-").replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return NaN;
    return Number(text);
  }

  function format(value) {
    if (value === null || !Number.isFinite(value)) return "—";
    if (value === 0) return "0";
    if (Math.abs(value) < 0.001 || Math.abs(value) >= 100000) return value.toExponential(3);
    return Number(value.toPrecision(8)).toString();
  }

  function run(event) {
    event.preventDefault();
    if (!solve) return;
    pause();
    clearValidation();
    result = null;
    current = 0;

    const inputs = [...matrix.children, ...rhs.children, ...initial.children];
    const values = inputs.map(numeric);
    const invalid = values.findIndex((value) => !Number.isFinite(value));
    const toleranceInput = byId("tolerance");
    const limitInput = byId("limit");
    const tolerance = numeric(toleranceInput);
    const limit = Number(limitInput.value);
    if (invalid !== -1) {
      showError("Введите конечное число в выделенном поле.", inputs[invalid]);
    } else if (!(tolerance > 0 && tolerance < 1)) {
      showError("Точность ε должна быть больше 0 и меньше 1.", toleranceInput);
    } else if (!Number.isInteger(limit) || limit < 1 || limit > 300) {
      showError("Укажите целый лимит от 1 до 300.", limitInput);
    } else {
      const n = dimension;
      const a = Array.from({ length: n }, (_, i) => values.slice(i * n, (i + 1) * n));
      try {
        const calculated = solve({
          n, limit, tolerance, a, b: values.slice(n * n, n * n + n), x0: values.slice(-n),
        });
        if (calculated.status < 0) {
          showError(invalidSystem[calculated.status]);
        } else {
          result = { ...calculated, a };
          current = result.history.length - 1;
          if (result.status === 2) {
            showError("Численный сбой. Проверьте масштабы коэффициентов и заданную точность.");
          }
        }
      } catch {
        showError("Ошибка выполнения Fortran. Обновите страницу и повторите расчёт.");
      }
    }
    if (!result) setStatus("Проверьте ввод", "error");
    else if (result.status === 1) setStatus("Сошёлся", "success");
    else if (result.status === 0) setStatus("Достигнут лимит", "warning");
    else setStatus("Численный сбой", "error");
    trajectory.setData(result);
    if (graph !== "trajectory") byId("trajectory-axes").hidden = true;
    updateHistory();
    render();
  }

  function pause() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    playButton.textContent = "▶";
    playButton.title = "Воспроизвести итерации";
    playButton.setAttribute("aria-label", playButton.title);
  }

  function selectStep(index) {
    if (!result) return;
    current = Math.max(0, Math.min(index, result.history.length - 1));
    render();
  }

  function cell(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function updateHistory() {
    const heading = document.createElement("tr");
    heading.append(...["k", "‖b − Ax‖₂", "αₖ₋₁", "βₖ₋₁", ...(result ? names.slice(0, dimension) : [])]
      .map((label) => cell("th", label)));
    byId("history-head").replaceChildren(heading);
    byId("history-body").replaceChildren(...(result?.history.map((step, k) => {
      const row = document.createElement("tr");
      const index = document.createElement("td");
      const button = cell("button", k);
      button.type = "button";
      button.className = "history-link";
      button.setAttribute("aria-label", `Выбрать итерацию ${k}`);
      button.addEventListener("click", () => { pause(); selectStep(k); });
      index.append(button);
      row.append(index, ...[step.norm, step.alpha, step.beta, ...step.x].map((value) => cell("td", format(value))));
      return row;
    }) ?? []));
  }

  function render() {
    const last = result ? result.history.length - 1 : 0;
    const step = result?.history[current];
    slider.max = Math.max(1, last);
    slider.value = current;
    slider.disabled = last === 0;
    byId("prev").disabled = current === 0;
    byId("next").disabled = current >= last;
    playButton.disabled = last === 0;
    byId("iteration-count").textContent = step ? `${current} / ${last}` : "— / —";
    byId("metric-step").textContent = step ? current : "—";
    byId("metric-norm").textContent = format(step?.norm);
    byId("metric-alpha").textContent = format(step?.alpha);
    const container = byId("solution-vector");
    container.style.setProperty("--vector-cols", step?.x.length ?? 1);
    const coordinates = step?.x.map((value, index) => {
      const coordinate = document.createElement("div");
      coordinate.append(cell("span", names[index]), cell("strong", format(value)));
      return coordinate;
    }) ?? [];
    container.replaceChildren(...coordinates);
    byId("solution-caption").textContent = step
      ? (current === last && result.status === 1 ? `Решение на итерации ${current}` : `Приближение на итерации ${current}`)
      : "Запустите расчёт, чтобы увидеть приближение.";
    [...byId("history-body").rows].forEach((row, index) => {
      row.dataset.current = String(index === current);
      if (index === current) row.cells[0].firstElementChild.setAttribute("aria-current", "step");
      else row.cells[0].firstElementChild.removeAttribute("aria-current");
    });
    canvas.setAttribute("aria-label", step
      ? `График нормы невязки. Итерация ${current} из ${last}, норма ${format(step.norm)}`
      : "График нормы невязки по итерациям");
    drawActiveGraph();
  }

  function drawActiveGraph() {
    if (graph === "trajectory") trajectory.draw(current);
    else draw();
  }

  function selectGraph(mode) {
    graph = mode;
    const showTrajectory = mode === "trajectory";
    graphs.forEach((button) => button.setAttribute("aria-pressed", button.dataset.graph === mode));
    byId("trajectory-panel").hidden = !showTrajectory;
    byId("residual-panel").hidden = showTrajectory;
    byId("trajectory-axes").hidden = !showTrajectory || !result || result.a.length === 2;
    const description = byId("graph-description");
    description.replaceChildren(
      document.createTextNode(showTrajectory ? "Линии уровня " : "Евклидова норма невязки "),
      cell("var", showTrajectory ? "f(x) = ½xᵀAx − bᵀx" : "‖b − Ax‖₂"),
    );
    drawActiveGraph();
  }

  function draw() {
    if (!ctx) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.font = '10px "IBM Plex Mono", Consolas, monospace';

    const norms = result?.history.map((entry) => entry.norm) ?? [];
    const valid = norms.filter(Number.isFinite);
    const threshold = result?.threshold;
    const logarithmic = scale === "log";
    byId("log-zero").hidden = !logarithmic || !norms.includes(0);
    byId("threshold-label").title = Number.isFinite(threshold) ? format(threshold) : "";
    plot = null;
    if (valid.length === 0) {
      ctx.fillStyle = "#cdc0e2";
      ctx.textAlign = "center";
      ctx.fillText("График появится после расчёта", width / 2, height / 2);
      return;
    }
    const positive = [...valid, threshold].filter((value) => Number.isFinite(value) && value > 0);
    const top = 13;
    const bottom = height - 22;
    const left = width < 330 ? 53 : 59;
    const right = width - 12;
    const logMax = positive.length ? Math.ceil(Math.log10(Math.max(...positive))) : 0;
    const logMin = positive.length ? Math.floor(Math.log10(Math.min(...positive))) : -6;
    const max = logarithmic ? logMax : Math.max(...positive, Number.MIN_VALUE);
    const logRange = Math.max(2, logMax - logMin) + (norms.includes(0) ? 1 : 0);
    const logStride = Math.ceil(logRange / 5);
    const min = logarithmic ? logMax - Math.ceil(logRange / logStride) * logStride : 0;
    const y = (value) => {
      if (logarithmic) {
        return value <= 0 ? bottom : bottom - (Math.log10(value) - min) / (max - min) * (bottom - top);
      }
      return bottom - (value / max) * (bottom - top);
    };
    const last = norms.length - 1;
    const x = (k) => left + (last ? k / last : 0) * (right - left);
    plot = { left, right, last };
    const tickCount = logarithmic ? (max - min) / logStride : 4;
    ctx.lineWidth = 1;
    for (let i = 0; i <= tickCount; i++) {
      const fraction = i / tickCount;
      const py = bottom - fraction * (bottom - top);
      ctx.strokeStyle = "#ffffff20";
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
      ctx.stroke();
      ctx.fillStyle = "#d0c2e5";
      ctx.textAlign = "right";
      const exponent = min + i * logStride;
      const label = logarithmic
        ? `1e${exponent}`
        : (i ? (max * fraction).toExponential(1) : "0");
      ctx.fillText(label, left - 8, py + 3);
    }
    const ticks = Math.min(last, width < 390 ? 5 : 9);
    ctx.textAlign = "center";
    for (let i = 0; i <= ticks; i++) {
      const k = ticks ? Math.round(i * last / ticks) : 0;
      ctx.fillText(String(k), x(k), bottom + 16);
    }

    if (Number.isFinite(threshold)) {
      ctx.strokeStyle = "#e3b782";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, y(threshold));
      ctx.lineTo(right, y(threshold));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const points = norms.flatMap((value, k) => Number.isFinite(value) ? [{ k, px: x(k), py: y(value) }] : []);
    const area = ctx.createLinearGradient(0, top, 0, bottom);
    area.addColorStop(0, "#b596ff51");
    area.addColorStop(1, "#b596ff07");
    ctx.beginPath();
    points.forEach(({ px, py }) => ctx.lineTo(px, py));
    ctx.lineTo(points.at(-1).px, bottom);
    ctx.lineTo(points[0].px, bottom);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();
    ctx.beginPath();
    points.forEach(({ px, py }) => ctx.lineTo(px, py));
    ctx.strokeStyle = "#ba9eff";
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const { k, px, py } of points) {
      if (points.length > 32 && k !== current) continue;
      if (k === current) {
        ctx.beginPath();
        ctx.moveTo(px, top);
        ctx.lineTo(px, bottom);
        ctx.strokeStyle = "#c4a5ff57";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#b591ff51";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, k === current ? 4.3 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = k === current ? "#fff" : "#ba9eff";
      ctx.fill();
    }
  }

  function selectTab(history) {
    byId("history-tab").setAttribute("aria-pressed", history);
    byId("vector-tab").setAttribute("aria-pressed", !history);
    byId("history").hidden = !history;
    byId("solution-vector").hidden = history;
  }

  form.addEventListener("submit", run);
  form.addEventListener("input", (event) => {
    if (event.target === example) return;
    if (matrix.contains(event.target) || rhs.contains(event.target)) example.value = "custom";
    markEdited();
  });
  example.addEventListener("change", () => {
    if (Object.hasOwn(examples, example.value)) useExample(example.value);
  });
  for (const button of sizes) {
    button.addEventListener("click", () => {
      const next = Number(button.dataset.size);
      if (next === dimension) return;
      const a = Array.from({ length: next }, (_, i) => Array.from({ length: next }, (_, j) =>
        i < dimension && j < dimension ? matrix.children[i * dimension + j].value : Number(i === j)));
      const b = Array.from({ length: next }, (_, i) => rhs.children[i]?.value ?? 0);
      const x0 = Array.from({ length: next }, (_, i) => initial.children[i]?.value ?? 0);
      fill(a, b, x0);
      example.value = "custom";
      markEdited();
    });
  }
  for (const button of scales) {
    button.addEventListener("click", () => {
      scale = button.dataset.scale;
      scales.forEach((item) => item.setAttribute("aria-pressed", item === button));
      draw();
    });
  }
  for (const button of graphs) {
    button.addEventListener("click", () => selectGraph(button.dataset.graph));
  }
  byId("prev").addEventListener("click", () => { pause(); selectStep(current - 1); });
  byId("next").addEventListener("click", () => { pause(); selectStep(current + 1); });
  slider.addEventListener("input", () => { pause(); selectStep(Number(slider.value)); });
  playButton.addEventListener("click", () => {
    if (timer !== null) { pause(); return; }
    const last = result.history.length - 1;
    if (current === last) selectStep(0);
    playButton.textContent = "Ⅱ";
    playButton.title = "Приостановить воспроизведение";
    playButton.setAttribute("aria-label", playButton.title);
    timer = window.setInterval(() => {
      selectStep(current + 1);
      if (current === last) pause();
    }, 550);
  });
  canvas.addEventListener("click", (event) => {
    if (!plot) return;
    const px = event.clientX - canvas.getBoundingClientRect().left;
    pause();
    selectStep(Math.round((px - plot.left) / (plot.right - plot.left) * plot.last));
  });
  byId("vector-tab").addEventListener("click", () => selectTab(false));
  byId("history-tab").addEventListener("click", () => selectTab(true));
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && solve) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.querySelectorAll("nav a").forEach((link, _, links) => link.addEventListener("click", () => {
    links.forEach((item) => item.classList.toggle("nav-active", item === link));
  }));
  new ResizeObserver(draw).observe(canvas);
  useExample("poisson");
  loadCgSolver(globalThis.cgWasmBase64).then((engine) => {
    solve = engine;
    byId("engine").classList.add("ready");
    byId("solve").disabled = false;
    form.requestSubmit();
  }).catch(() => {
    byId("engine").classList.add("failed");
    setStatus("Модуль недоступен", "error");
    showError("Не удалось загрузить модуль Fortran / WebAssembly. Обновите страницу.");
  });
})();
