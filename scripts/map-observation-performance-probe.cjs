const { chromium } = require('C:/Users/15005/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

function topSamples(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map();
  for (let index = 0; index < (profile.samples ?? []).length; index += 1) {
    const node = nodes.get(profile.samples[index]);
    if (!node) continue;
    const frame = node.callFrame;
    const key = `${frame.functionName || '(anonymous)'} @ ${frame.url || '(runtime)'}`;
    totals.set(key, (totals.get(key) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1_000);
  }
  return [...totals].sort((left, right) => right[1] - left[1]).slice(0, 20);
}

async function profileAction(page, action) {
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.start');
  const startedAt = performance.now();
  await action();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const wallMs = performance.now() - startedAt;
  const { profile } = await session.send('Profiler.stop');
  await session.detach();
  return { wallMs, topSamples: topSamples(profile) };
}

async function createWorld(page, { scale, years, mode }) {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '开始新游戏' }).click();
  await page.getByRole('button', { name: new RegExp(mode) }).click();
  await page.getByRole('button', { name: new RegExp(scale) }).click();
  await page.getByRole('button', {
    name: years === 0 ? /不预推/ : new RegExp(`^${years}年`),
  }).click();
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.getByPlaceholder('你的姓名').fill('地图性能探针');
  await page.getByRole('button', { name: '测试灵根' }).click();
  const startedAt = performance.now();
  await page.getByRole('button', { name: '降临大千世界' }).click();
  await page.getByRole('button', { name: '大地图', exact: true }).waitFor({ state: 'visible', timeout: 180_000 });
  return performance.now() - startedAt;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__taosimLongTasks = [];
    new PerformanceObserver((list) => {
      window.__taosimLongTasks.push(...list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration,
      })));
    }).observe({ entryTypes: ['longtask'] });
  });

  const generationMs = await createWorld(page, {
    scale: process.argv[2] ?? '中世界',
    years: Number(process.argv[3] ?? 30),
    mode: process.argv[4] ?? '穿越',
  });
  const snapshot = async () => page.evaluate(() => ({
    svgNodes: document.querySelectorAll('svg *').length,
    lines: document.querySelectorAll('svg line').length,
    texts: document.querySelectorAll('svg text').length,
    buttons: document.querySelectorAll('button').length,
    longTasks: window.__taosimLongTasks.splice(0),
  }));

  const before = await snapshot();
  const probeHexes = await page.locator('[role="button"][aria-label^="地图格 "]').evaluateAll((elements) => {
    const playerHex = elements.find((element) =>
      element.querySelector('polygon')?.getAttribute('stroke')?.toLowerCase() === '#fbbf24');
    const playerHexLabel = playerHex?.getAttribute('aria-label') ?? null;
    const match = playerHexLabel?.match(/^地图格 (-?\d+),(-?\d+)/);
    if (!match) return { playerHexLabel, targetHexLabel: null };
    const q = Number(match[1]);
    const r = Number(match[2]);
    const adjacent = [[q + 1, r], [q + 1, r - 1], [q, r - 1], [q - 1, r], [q - 1, r + 1], [q, r + 1]];
    const target = elements.find((element) => {
      const label = element.getAttribute('aria-label') ?? '';
      const isAdjacent = adjacent.some(([targetQ, targetR]) => label.startsWith(`地图格 ${targetQ},${targetR}`));
      return isAdjacent && element.querySelector('polygon')?.getAttribute('fill')?.toLowerCase() !== '#0a0a1a';
    });
    return { playerHexLabel, targetHexLabel: target?.getAttribute('aria-label') ?? null };
  });
  const { playerHexLabel, targetHexLabel } = probeHexes;
  if (!playerHexLabel) throw new Error('无法从权威玩家标记识别当前地图格');
  if (!targetHexLabel) throw new Error(`玩家相邻格均不可移动: ${playerHexLabel}`);
  const startTravel = await profileAction(page, () => page.getByRole('button', { name: targetHexLabel, exact: true }).click({ button: 'right' }));
  const afterStart = await snapshot();
  const travelControl = page.getByRole('button', { name: /推进\s*1\s*小时/ });
  const travelControlCount = await travelControl.count();
  if (travelControlCount === 0) {
    const diagnostics = (await page.locator('body').innerText())
      .split('\n')
      .filter((line) => /无法|已经|路线|旅行|行程|途中/.test(line))
      .slice(0, 20);
    throw new Error(`旅行未启动: ${JSON.stringify({ playerHexLabel, targetHexLabel, startTravel, afterStart, diagnostics })}`);
  }
  const advanceOneHour = await profileAction(page, () => travelControl.click());
  const afterAdvance = await snapshot();

  process.stdout.write(`${JSON.stringify({ generationMs, playerHexLabel, targetHexLabel, before, startTravel, afterStart, advanceOneHour, afterAdvance, errors }, null, 2)}\n`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
