const state = {
  projects: [
    {
      id: 1,
      title: "GameBear",
      category: "games",
      label: "Empresa de Desenvolvimento de Jogos",
      description: "Estudio especializado no desenvolvimento de jogos para PC, Mobile e Web, criando experiencias imersivas para jogadores do mundo inteiro.",
      shortDescription: "Experiencias gamer para PC, Mobile e Web.",
      stack: "Design gamer, UI neon, web interativa",
      progress: 100,
      url: "#",
      cover: "images/gamebear-cover.svg",
      logo: "images/gamebear-logo.svg",
      theme: "Escuro, azul e roxo neon",
      features: ["Design gamer", "Tons escuros", "Azul e roxo neon", "Interface moderna"]
    },
    {
      id: 2,
      title: "SafeCore",
      category: "security",
      label: "Blog de Tecnologia e Segurança Digital",
      description: "Portal focado em cibersegurança, privacidade digital, proteção de dados e noticias sobre tecnologia.",
      shortDescription: "Blog profissional sobre ciberseguranca e privacidade.",
      stack: "Blog, SEO, artigos em destaque",
      progress: 100,
      url: "https://sosorke.github.io/safecore/",
      cover: "images/safecore-cover.svg",
      logo: "images/safecore-logo.svg",
      theme: "Corporativo, branco e azul",
      features: ["Visual corporativo", "Branco e azul", "Layout de blog profissional", "Artigos em destaque"]
    },
    {
      id: 3,
      title: "Shield Woman",
      category: "store",
      label: "Loja de Defesa Pessoal Feminina",
      description: "E-commerce especializado em artigos voltados para segurança e proteção feminina, com foco em conscientização, informação e prevenção.",
      shortDescription: "Loja virtual elegante para seguranca e protecao feminina.",
      stack: "E-commerce, catalogo, conteudo educativo",
      progress: 100,
      url: "https://sosorke.github.io/nicolastrabalho1/",
      cover: "images/shieldwoman-cover.svg",
      logo: "images/shieldwoman-logo.svg",
      theme: "Roxo, branco e preto",
      features: ["Visual elegante", "Roxo, branco e preto", "Layout de loja virtual", "Catalogo de produtos"]
    }
  ]
};

const selectors = {
  loader: document.querySelector("#loader"),
  grid: document.querySelector("#floatingGrid"),
  header: document.querySelector("#siteHeader"),
  navToggle: document.querySelector("#navToggle"),
  navMenu: document.querySelector("#navMenu"),
  projectGrid: document.querySelector("#projectGrid"),
  modal: document.querySelector("#projectModal"),
  modalContent: document.querySelector("#modalContent"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
  toTop: document.querySelector("#toTop"),
  canvas: document.querySelector("#particleCanvas")
};

const THEME_KEY = "buildhub_theme";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initHeaderScroll();
  initDashboard();
  initClickEffect();
  initHeroTilt();
  if (selectors.grid) createFloatingBlocks();
  if (selectors.canvas) initParticles();
  if (selectors.projectGrid) {
    renderProjects();
    bindPortfolio();
  }
  if (selectors.navToggle && selectors.navMenu) bindNavigation();
  bindPortfolioLinks();
  initRevealAnimations();

  setTimeout(() => {
    selectors.loader?.classList.add("done");
    document.documentElement.classList.add("is-ready");
    window.dispatchEvent(new Event("buildhub:ready"));
  }, 850);
});

function initTheme() {
  const isDark = localStorage.getItem(THEME_KEY) === "dark";
  document.documentElement.classList.toggle("dark-theme", isDark);
  document.body.classList.toggle("dark-theme", isDark);
  updateThemeToggle(isDark);

  selectors.themeToggle?.addEventListener("click", () => {
    const nextIsDark = !document.body.classList.contains("dark-theme");
    document.documentElement.classList.toggle("dark-theme", nextIsDark);
    document.body.classList.toggle("dark-theme", nextIsDark);
    localStorage.setItem(THEME_KEY, nextIsDark ? "dark" : "light");
    updateThemeToggle(nextIsDark);
  });
}

function updateThemeToggle(isDark) {
  if (!selectors.themeToggle) return;
  selectors.themeToggle.setAttribute("aria-label", isDark ? "Ativar tema claro" : "Ativar tema escuro");
  selectors.themeToggle.setAttribute("title", isDark ? "Ativar tema claro" : "Ativar tema escuro");
}

const dashboardData = {
  "7d": {
    labels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    visits: [1420, 1680, 1550, 2010, 2240, 1390, 1180],
    conv: [3.1, 3.4, 3.2, 3.9, 4.2, 3.3, 3.0],
    revenue: [1850, 2420, 2160, 3140, 3680, 2010, 1480],
    deltas: { visits: "+12,4%", conv: "+0,4 pp", revenue: "+9,1%" }
  },
  "30d": {
    labels: ["01", "04", "07", "10", "13", "16", "19", "22", "25", "28"],
    visits: [1320, 1510, 1470, 1830, 1760, 2120, 2050, 2380, 2290, 2610],
    conv: [3.0, 3.1, 3.0, 3.4, 3.3, 3.6, 3.5, 3.9, 3.8, 4.1],
    revenue: [1700, 2050, 1980, 2700, 2540, 3260, 3120, 3880, 3690, 4320],
    deltas: { visits: "+18,2%", conv: "+0,6 pp", revenue: "+14,7%" }
  },
  "12m": {
    labels: ["Nov", "Dez", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out"],
    visits: [18200, 17400, 19800, 21500, 22900, 24100, 23600, 26800, 28400, 30100, 29700, 33200],
    conv: [2.6, 2.5, 2.8, 2.9, 3.0, 3.1, 3.0, 3.3, 3.5, 3.6, 3.6, 3.9],
    revenue: [21400, 20800, 24500, 27300, 29800, 32100, 31400, 36900, 40200, 43800, 42900, 48200],
    deltas: { visits: "+71%", conv: "+1,3 pp", revenue: "+125%" }
  }
};

const dashboardMetricNames = { visits: "Visitas", conv: "Conversão", revenue: "Receita" };

function compactNumber(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1).replace(".", ",")}M`;
  if (value >= 1e4) return `${(value / 1e3).toFixed(1).replace(".", ",")}k`;
  return Math.round(value).toLocaleString("pt-BR");
}

function formatMetric(metric, value, compact = false) {
  if (metric === "conv") return `${value.toFixed(1).replace(".", ",")}%`;
  const number = compact ? compactNumber(value) : Math.round(value).toLocaleString("pt-BR");
  return metric === "revenue" ? `R$ ${number}` : number;
}

function metricTotal(metric, values) {
  const sum = values.reduce((total, value) => total + value, 0);
  return metric === "conv" ? sum / values.length : sum;
}

function smoothPath(points) {
  let path = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

function initDashboard() {
  const dash = document.querySelector(".dash");
  if (!dash) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chart = dash.querySelector("#dashChart");
  const svg = chart.querySelector("svg");
  const line = svg.querySelector(".dash-line");
  const area = svg.querySelector(".dash-area");
  const labelsGroup = svg.querySelector(".dash-labels");
  const hover = svg.querySelector(".dash-hover");
  const hoverLine = svg.querySelector(".dash-hover__line");
  const hoverDot = svg.querySelector(".dash-hover__dot");
  const tip = chart.querySelector(".dash-tip");
  const kpis = [...dash.querySelectorAll(".dash-kpi")];
  const rangeButtons = [...dash.querySelectorAll("[data-range]")];

  const view = { range: "7d", metric: "visits" };
  const shown = { visits: 0, conv: 0, revenue: 0 };
  const tweens = {};
  const plot = { x0: 8, x1: 392, y0: 18, y1: 118 };
  let points = [];
  let activeIndex = -1;

  function tween(kpi, metric, target) {
    const output = kpi.querySelector(".dash-kpi__value");
    const from = shown[metric];
    const start = performance.now();
    const duration = reduceMotion ? 0 : 700;
    const token = (tweens[metric] = (tweens[metric] || 0) + 1);

    function step(now) {
      if (tweens[metric] !== token) return;
      const t = duration ? Math.min((now - start) / duration, 1) : 1;
      const eased = 1 - Math.pow(1 - t, 3);
      shown[metric] = from + (target - from) * eased;
      output.textContent = formatMetric(metric, shown[metric], true);
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function renderKpis() {
    const data = dashboardData[view.range];
    kpis.forEach((kpi) => {
      const metric = kpi.dataset.metric;
      tween(kpi, metric, metricTotal(metric, data[metric]));
      kpi.querySelector(".dash-kpi__delta").innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>${data.deltas[metric]}`;
      kpi.classList.toggle("is-active", metric === view.metric);
      kpi.setAttribute("aria-pressed", String(metric === view.metric));
    });
  }

  function restartDraw() {
    if (reduceMotion) return;
    line.style.transition = "none";
    line.style.strokeDashoffset = "1";
    area.style.transition = "none";
    area.style.opacity = "0";
    line.getBoundingClientRect();
    line.style.transition = "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)";
    line.style.strokeDashoffset = "0";
    area.style.transition = "opacity 700ms ease 250ms";
    area.style.opacity = "1";
  }

  function renderChart() {
    const data = dashboardData[view.range];
    const values = data[view.metric];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const low = min - (max - min) * 0.18;
    const high = max + (max - min) * 0.1;

    points = values.map((value, index) => ({
      x: plot.x0 + (index / (values.length - 1)) * (plot.x1 - plot.x0),
      y: plot.y1 - ((value - low) / (high - low)) * (plot.y1 - plot.y0)
    }));

    const path = smoothPath(points);
    line.setAttribute("d", path);
    area.setAttribute("d", `${path} L${points[points.length - 1].x} 128 L${points[0].x} 128 Z`);
    labelsGroup.innerHTML = points.map((point, index) => `<text x="${point.x.toFixed(1)}" y="143">${data.labels[index]}</text>`).join("");
    hidePoint();
    restartDraw();
  }

  // Área do <svg> dentro do gráfico, em coordenadas locais (sem a inclinação 3D).
  function chartBox() {
    const style = getComputedStyle(chart);
    const left = parseFloat(style.paddingLeft);
    return { left, top: parseFloat(style.paddingTop), width: chart.clientWidth - left - parseFloat(style.paddingRight) };
  }

  function showPoint(index) {
    const data = dashboardData[view.range];
    activeIndex = Math.max(0, Math.min(points.length - 1, index));
    const point = points[activeIndex];

    hover.setAttribute("opacity", "1");
    hoverLine.setAttribute("d", `M${point.x} 10V${plot.y1}`);
    hoverDot.setAttribute("cx", point.x);
    hoverDot.setAttribute("cy", point.y);

    tip.querySelector("span").textContent = `${data.labels[activeIndex]} · ${dashboardMetricNames[view.metric]}`;
    tip.querySelector("strong").textContent = formatMetric(view.metric, data[view.metric][activeIndex]);

    const box = chartBox();
    const scale = box.width / 400;
    const half = tip.offsetWidth / 2 + 4;
    const left = box.left + point.x * scale;
    tip.style.left = `${Math.max(half, Math.min(chart.clientWidth - half, left))}px`;
    tip.style.top = `${box.top + point.y * scale - 12}px`;
    tip.style.opacity = "1";
  }

  function hidePoint() {
    activeIndex = -1;
    hover.setAttribute("opacity", "0");
    tip.style.opacity = "0";
  }

  chart.addEventListener("pointermove", (event) => {
    if (!points.length) return;
    const box = chartBox();
    const x = ((event.offsetX - box.left) / box.width) * 400;
    showPoint(Math.round(((x - plot.x0) / (plot.x1 - plot.x0)) * (points.length - 1)));
  });
  chart.addEventListener("pointerleave", hidePoint);
  chart.addEventListener("blur", hidePoint);
  chart.addEventListener("keydown", (event) => {
    if (!points.length || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    showPoint(activeIndex === -1 ? (step > 0 ? 0 : points.length - 1) : activeIndex + step);
  });

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      view.range = button.dataset.range;
      rangeButtons.forEach((item) => {
        item.classList.toggle("is-active", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderKpis();
      renderChart();
    });
  });

  kpis.forEach((kpi) => {
    kpi.addEventListener("click", () => {
      if (view.metric === kpi.dataset.metric) return;
      view.metric = kpi.dataset.metric;
      renderKpis();
      renderChart();
    });
  });

  const start = () => setTimeout(() => {
    dash.classList.add("is-ready");
    renderKpis();
    renderChart();
  }, reduceMotion ? 0 : 700);

  if (document.documentElement.classList.contains("is-ready")) start();
  else window.addEventListener("buildhub:ready", start, { once: true });
}

function initHeroTilt() {
  const hero = document.querySelector(".hero");
  const orbit = document.querySelector("#heroOrbit");
  const stage = document.querySelector("#dashStage");
  if (!hero || !orbit || !stage) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const rest = { x: 7, y: -10 };
  const target = { ...rest };
  const current = { ...rest };
  let frame = 0;

  function tick() {
    current.x += (target.x - current.x) * 0.1;
    current.y += (target.y - current.y) * 0.1;
    stage.style.setProperty("--rx", `${current.x.toFixed(2)}deg`);
    stage.style.setProperty("--ry", `${current.y.toFixed(2)}deg`);
    const settled = Math.abs(target.x - current.x) < 0.01 && Math.abs(target.y - current.y) < 0.01;
    frame = settled ? 0 : requestAnimationFrame(tick);
  }

  function kick() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function release() {
    target.x = rest.x;
    target.y = rest.y;
    stage.classList.remove("is-active");
    kick();
  }

  hero.addEventListener("pointermove", (event) => {
    const rect = orbit.getBoundingClientRect();
    const px = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / rect.width));
    const py = Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height / 2)) / rect.height));
    target.y = rest.y + px * 12;
    target.x = rest.x - py * 10;

    const gx = ((event.clientX - rect.left) / rect.width) * 100;
    const gy = ((event.clientY - rect.top) / rect.height) * 100;
    stage.style.setProperty("--gx", `${Math.max(0, Math.min(100, gx))}%`);
    stage.style.setProperty("--gy", `${Math.max(0, Math.min(100, gy))}%`);
    stage.classList.toggle("is-active", gx >= 0 && gx <= 100 && gy >= 0 && gy <= 100);
    kick();
  });
  hero.addEventListener("pointerleave", release);
  hero.addEventListener("pointercancel", release);
}

function createFloatingBlocks() {
  const blockCount = Math.min(90, Math.floor(window.innerWidth / 16));
  selectors.grid.innerHTML = "";

  for (let index = 0; index < blockCount; index += 1) {
    const block = document.createElement("span");
    block.className = "float-block";
    block.dataset.baseX = Math.random() * 100;
    block.dataset.baseY = Math.random() * 100;
    block.style.left = `${block.dataset.baseX}%`;
    block.style.top = `${block.dataset.baseY}%`;
    block.style.width = `${6 + Math.random() * 11}px`;
    block.style.height = block.style.width;
    block.style.animationDelay = `${Math.random() * -8}s`;
    block.style.opacity = `${0.26 + Math.random() * 0.42}`;
    selectors.grid.appendChild(block);
  }

  if (!createFloatingBlocks.bound) {
    document.addEventListener("mousemove", scatterBlocks);
    createFloatingBlocks.bound = true;
  }
}

function scatterBlocks(event) {
  const blocks = selectors.grid.children;
  const influence = 130;

  Array.from(blocks).forEach((block) => {
    const rect = block.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);

    if (distance < influence) {
      const strength = (influence - distance) / influence;
      const angle = Math.atan2(centerY - event.clientY, centerX - event.clientX);
      const move = 44 * strength;
      const rotate = 35 * strength * (centerX > event.clientX ? 1 : -1);
      block.classList.add("scatter");
      block.style.transform = `translate3d(${Math.cos(angle) * move}px, ${Math.sin(angle) * move}px, 0) rotate(${rotate}deg)`;
    } else {
      block.classList.remove("scatter");
      block.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
    }
  });
}

function initParticles() {
  const canvas = selectors.canvas;
  const context = canvas.getContext("2d");
  const particles = [];

  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  function seed() {
    particles.length = 0;
    const total = Math.min(70, Math.floor(window.innerWidth / 18));
    for (let index = 0; index < total; index += 1) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        size: Math.random() * 1.7 + 0.6
      });
    }
  }

  function draw() {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < 0 || particle.x > window.innerWidth) particle.vx *= -1;
      if (particle.y < 0 || particle.y > window.innerHeight) particle.vy *= -1;

      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fillStyle = "rgba(16, 0, 114, 0.18)";
      context.fill();
    });
    requestAnimationFrame(draw);
  }

  resize();
  seed();
  draw();
  window.addEventListener("resize", () => {
    resize();
    seed();
    createFloatingBlocks();
  });
}

function initHeaderScroll() {
  if (!selectors.header) return;
  const update = () => selectors.header.classList.toggle("is-scrolled", window.scrollY > 24);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function bindNavigation() {
  selectors.navToggle.addEventListener("click", () => {
    const isOpen = selectors.navMenu.classList.toggle("open");
    selectors.navToggle.classList.toggle("open", isOpen);
    selectors.navToggle.setAttribute("aria-expanded", String(isOpen));
    selectors.navToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
  });

  selectors.navMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMobileMenu());
  });

  document.addEventListener("click", (event) => {
    if (!selectors.header.contains(event.target)) closeMobileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });

  window.matchMedia("(min-width: 1081px)").addEventListener("change", closeMobileMenu);

  window.addEventListener("scroll", () => {
    selectors.toTop.classList.toggle("visible", window.scrollY > 620);
    updateActiveNav();
  });

  selectors.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function bindPortfolioLinks() {
  document.querySelectorAll('a[href="#portfolio"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const portfolio = document.querySelector("#portfolio");
      if (!portfolio) {
        window.location.href = "index.html#portfolio";
        return;
      }

      event.preventDefault();
      portfolio.scrollIntoView({ behavior: "smooth", block: "start" });
      closeMobileMenu();
    });
  });
}

function closeMobileMenu() {
  selectors.navMenu.classList.remove("open");
  selectors.navToggle.classList.remove("open");
  selectors.navToggle.setAttribute("aria-expanded", "false");
  selectors.navToggle.setAttribute("aria-label", "Abrir menu");
}

function updateActiveNav() {
  const links = [...selectors.navMenu.querySelectorAll("a")];
  let current = "home";
  let currentTop = -Infinity;

  links.forEach((link) => {
    const section = document.getElementById(link.getAttribute("href").slice(1));
    if (!section) return;
    const top = section.getBoundingClientRect().top;
    if (top <= 150 && top > currentTop) {
      current = section.id;
      currentTop = top;
    }
  });

  links.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
}

function renderProjects() {
  selectors.projectGrid.innerHTML = state.projects.map((project) => `
    <article class="project-card premium-project-card reveal" role="button" tabindex="0" data-project-id="${project.id}" data-category="${project.category}">
      <div class="project-visual premium-project-visual">
        <img class="project-cover" src="${project.cover}" alt="Capa do projeto ${project.title}">
        <span class="project-shine" aria-hidden="true"></span>
      </div>
      <div class="project-body premium-project-body">
        <img class="project-logo" src="${project.logo}" alt="Logo ${project.title}">
        <span class="project-category">${project.label}</span>
        <h3>${project.title}</h3>
        <p>${project.shortDescription || project.description}</p>
        <button class="project-button" type="button">Ver Projeto</button>
        <a class="project-link" href="${project.url || "#"}" target="_blank" rel="noopener noreferrer">Acessar site</a>
      </div>
    </article>
  `).join("");
  initRevealAnimations();
}

function bindPortfolio() {
  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      filterProjects(button.dataset.filter);
    });
  });

  selectors.projectGrid.addEventListener("click", (event) => {
    const externalLink = event.target.closest(".project-link");
    if (externalLink) {
      event.preventDefault();
      const card = externalLink.closest(".project-card");
      const project = state.projects.find((item) => item.id === Number(card?.dataset.projectId));
      if (!project?.url || project.url === "#") {
        showToast("Defina a URL do projeto antes de acessar o site.");
        return;
      }
      window.open(project.url, "_blank", "noopener,noreferrer");
      return;
    }
    const card = event.target.closest(".project-card");
    if (!card) return;
    const project = state.projects.find((item) => item.id === Number(card.dataset.projectId));
    openProjectModal(project);
  });

  selectors.projectGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".project-card");
    if (!card) return;
    event.preventDefault();
    const project = state.projects.find((item) => item.id === Number(card.dataset.projectId));
    openProjectModal(project);
  });

  selectors.modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) closeProjectModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeProjectModal();
  });
}

function filterProjects(filter) {
  selectors.projectGrid.querySelectorAll(".project-card").forEach((card) => {
    const shouldShow = filter === "all" || card.dataset.category === filter;
    card.hidden = !shouldShow;
  });
}

function openProjectModal(project) {
  selectors.modalContent.innerHTML = `
    <img class="modal-project-cover" src="${project.cover}" alt="Capa do projeto ${project.title}">
    <div class="modal-project-heading">
      <img class="project-logo" src="${project.logo}" alt="Logo ${project.title}">
      <div>
        <span class="project-category">${project.label}</span>
        <h2>${project.title}</h2>
      </div>
    </div>
    <p>${project.description}</p>
    <p><strong>Identidade:</strong> ${project.theme}</p>
    <p><strong>Entrega:</strong> ${project.stack}</p>
    <ul class="feature-list modal-feature-list">${project.features.map((feature) => `<li>${feature}</li>`).join("")}</ul>
    <div class="progress-track"><span style="width: ${project.progress}%"></span></div>
  `;
  selectors.modal.classList.add("open");
  selectors.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeProjectModal() {
  selectors.modal.classList.remove("open");
  selectors.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function initRevealAnimations() {
  if (!document.documentElement.classList.contains("is-ready")) {
    window.addEventListener("buildhub:ready", initRevealAnimations, { once: true });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry, index) => {
        const element = entry.target;
        element.style.transitionDelay = `${index * 80}ms`;
        element.classList.add("visible");
        setTimeout(() => { element.style.transitionDelay = ""; }, 1200);
        observer.unobserve(element);
      });
  }, { threshold: 0.16 });

  document.querySelectorAll(".reveal:not(.visible), [data-lines]:not(.visible)").forEach((element) => observer.observe(element));
}

// Anel que se expande onde o clique acontece. Sem loop e sem canvas: cada
// clique cria um <span> animado só por CSS (transform/opacity) que se remove
// sozinho; no máximo 6 ao mesmo tempo.
function initClickEffect() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let active = 0;
  document.addEventListener("pointerdown", (event) => {
    if (event.button > 0 || active >= 6) return;

    const ring = document.createElement("span");
    ring.className = "click-ring";
    ring.style.left = `${event.clientX}px`;
    ring.style.top = `${event.clientY}px`;
    active += 1;

    const remove = () => {
      if (!ring.isConnected) return;
      ring.remove();
      active -= 1;
    };
    ring.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 900);
    document.body.append(ring);
  }, { passive: true });
}

function showToast(message) {
  if (!selectors.toast) return;
  selectors.toast.textContent = message;
  selectors.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => selectors.toast.classList.remove("show"), 3200);
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
