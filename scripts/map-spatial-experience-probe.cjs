const { chromium } = require('C:/Users/15005/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function createRoleWorld(page) {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '开始新游戏' }).click();
  await page.getByRole('button', { name: /穿越/ }).click();
  await page.getByRole('button', { name: /小世界/ }).click();
  await page.getByRole('button', { name: /不预推/ }).click();
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.getByPlaceholder('你的姓名').fill('空间体验探针');
  await page.getByRole('button', { name: '测试灵根' }).click();
  await page.getByRole('button', { name: '降临大千世界' }).click();
  await page.getByRole('button', { name: '大地图', exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await createRoleWorld(page);
  const dateBefore = await page.locator('header').getByText(/道历/).innerText();
  const playerHex = page.locator('[role="button"][aria-label*="天机城"]');
  await playerHex.click();
  const zoomButton = page.getByRole('button', { name: '放大地图' });
  await zoomButton.click();
  await zoomButton.click();
  await zoomButton.click();
  await zoomButton.click();

  const settlement = page.getByRole('application', { name: '天机城局部地图' });
  await settlement.waitFor({ state: 'visible' });
  const dateAfterDrill = await page.locator('header').getByText(/道历/).innerText();
  const childNodeCount = await settlement.locator('g.cursor-pointer').count();

  await settlement.getByText('百宝阁', { exact: true }).click();
  await page.getByRole('button', { name: '沿道路前往', exact: true }).click();
  const travelStarted = await page.getByText('城内移动中', { exact: true }).isVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page.getByText('城内行程已暂停', { exact: true }).isVisible();

  await page.getByRole('button', { name: '存读档' }).click();
  await page.getByRole('button', { name: '保存当前进度' }).click();
  await page.getByText('已保存', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '加载', exact: true }).click();
  await page.getByText('已加载', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  const loadedPaused = await page.getByText('城内行程已暂停', { exact: true }).isVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '推进 1 小时', exact: true }).click();

  await page.getByRole('button', { name: '进入建筑', exact: true }).click();
  const venueVisible = await page.getByText('百宝阁', { exact: true }).count();
  await page.getByRole('button', { name: '离开城镇', exact: true }).click();
  const returnedToRegion = await page.getByRole('application', { name: '区域观察地图' }).isVisible();
  const focusedSpatialNodeAfterExit = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('taosim_map_state_v1') ?? '{}').focusedSpatialNodeId ?? null);

  process.stdout.write(`${JSON.stringify({
    dateBefore,
    dateAfterDrill,
    childNodeCount,
    travelStarted,
    paused,
    loadedPaused,
    venueVisible,
    returnedToRegion,
    focusedSpatialNodeAfterExit,
    errors,
  }, null, 2)}\n`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
