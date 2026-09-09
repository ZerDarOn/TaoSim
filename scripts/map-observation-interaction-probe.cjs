const { chromium } = require('C:/Users/15005/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// M1 观察层与区域相机回归：刻意停留在下钻阈值以下。
// 真实天机城下钻与城内分段旅行由 map-spatial-experience-probe.cjs 验证。

async function createRoleWorld(page) {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '开始新游戏' }).click();
  await page.getByRole('button', { name: /穿越/ }).click();
  await page.getByRole('button', { name: /小世界/ }).click();
  await page.getByRole('button', { name: /不预推/ }).click();
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.getByPlaceholder('你的姓名').fill('地图交互探针');
  await page.getByRole('button', { name: '测试灵根' }).click();
  await page.getByRole('button', { name: '降临大千世界' }).click();
  await page.getByRole('button', { name: '大地图', exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
}

async function currentMapHexes(page) {
  return page.locator('[role="button"][aria-label^="地图格 "]').evaluateAll((elements) => {
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
      return adjacent.some(([targetQ, targetR]) => label.startsWith(`地图格 ${targetQ},${targetR}`))
        && element.querySelector('polygon')?.getAttribute('fill')?.toLowerCase() !== '#0a0a1a';
    });
    return { playerHexLabel, targetHexLabel: target?.getAttribute('aria-label') ?? null };
  });
}

async function worldHeader(page) {
  return page.locator('header').getByText(/道历/).innerText();
}

async function storedMapPreferences(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('taosim_map_state_v1') ?? '{}'));
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
      window.__taosimLongTasks.push(...list.getEntries().map((entry) => entry.duration));
    }).observe({ entryTypes: ['longtask'] });
  });

  await createRoleWorld(page);
  const beforeDate = await worldHeader(page);
  const beforeHexes = await currentMapHexes(page);

  await page.getByRole('button', { name: '全部可知', exact: true }).click();
  const allKnownRouteCount = await page.getByTestId('npc-travel-route').count();
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  const hiddenNpcRouteCount = await page.getByTestId('npc-travel-route').count();

  if (!beforeHexes.targetHexLabel) throw new Error('没有可用于旅行测试的相邻非虚空格');
  await page.getByRole('button', { name: beforeHexes.targetHexLabel, exact: true }).click({ button: 'right' });
  const playerRouteWhileNpcRoutesOff = await page.getByTestId('player-travel-route').count();

  const viewport = page.getByRole('application', { name: '区域观察地图' });
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error('地图视口没有可交互边界');
  await page.evaluate(() => window.__taosimLongTasks.splice(0));
  const zoomPanStartedAt = performance.now();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.42);
  await page.mouse.wheel(0, -220);
  const zoomButton = page.getByRole('button', { name: '放大地图' });
  await zoomButton.click();
  await page.getByText(/区域 · \d+%/).waitFor({ state: 'visible' });
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.63, { steps: 12 });
  await page.mouse.up();
  const zoomPanWallMs = performance.now() - zoomPanStartedAt;
  const zoomPanLongTasks = await page.evaluate(() => window.__taosimLongTasks.splice(0));

  const afterZoomDate = await worldHeader(page);
  const afterZoomHexes = await currentMapHexes(page);
  const settlementDetails = await page.getByTestId('settlement-detail').count();
  const storedAfterZoom = await storedMapPreferences(page);

  await page.getByRole('button', { name: '角色', exact: true }).click();
  await page.getByRole('button', { name: '大地图', exact: true }).click();
  const persistedZoomLabel = await page.getByText(/区域 · \d+%/).innerText();

  await page.getByRole('button', { name: '存读档' }).click();
  await page.getByRole('button', { name: '保存当前进度' }).click();
  await page.getByText('已保存', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();

  await page.getByRole('button', { name: /推进\s*1\s*小时/ }).click();
  await page.getByRole('button', { name: '存读档' }).click();
  await page.getByRole('button', { name: '加载', exact: true }).click();
  await page.getByText('已加载', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();

  const loadedPreferences = await storedMapPreferences(page);
  const loadedTravelRouteCount = await page.getByTestId('player-travel-route').count();
  await page.getByRole('button', { name: '快进至抵达' }).click();
  await page.getByText('已抵达目的地；行程事实已结算一次', { exact: true }).waitFor({ state: 'visible' });
  const afterArrivalRouteCount = await page.getByTestId('player-travel-route').count();

  process.stdout.write(`${JSON.stringify({
    beforeDate,
    afterZoomDate,
    beforeHexes,
    afterZoomHexes,
    allKnownRouteCount,
    hiddenNpcRouteCount,
    playerRouteWhileNpcRoutesOff,
    settlementDetails,
    persistedZoomLabel,
    zoomPanWallMs,
    zoomPanLongTasks,
    storedRouteMode: storedAfterZoom.observationPreferences?.npcRoutes,
    loadedRouteMode: loadedPreferences.observationPreferences?.npcRoutes,
    loadedTravelRouteCount,
    afterArrivalRouteCount,
    errors,
  }, null, 2)}\n`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
