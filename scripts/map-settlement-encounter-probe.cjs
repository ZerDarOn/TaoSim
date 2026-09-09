const { chromium } = require('C:/Users/15005/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
let BASE_URL = process.env.TAOSIM_URL;
let ownedServerForCleanup = null;
let browserForCleanup = null;

async function startOwnedVite() {
  const port = 5199;
  const viteBin = path.resolve(__dirname, '../node_modules/vite/bin/vite.js');
  const server = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort'], {
    cwd: path.resolve(__dirname, '../apps/taosim-ui'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite 启动超时')), 20_000);
    const inspect = (chunk) => {
      const text = String(chunk);
      if (text.includes(`localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on('data', inspect);
    server.stderr.on('data', inspect);
    server.once('exit', (code) => reject(new Error(`Vite 提前退出: ${code}`)));
  });
  BASE_URL = `http://localhost:${port}/`;
  return server;
}

async function createRoleWorld(page) {
  if (!BASE_URL) throw new Error('浏览器地址尚未初始化');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '开始新游戏' }).click();
  await page.getByRole('button', { name: /穿越/ }).click();
  await page.getByRole('button', { name: /小世界/ }).click();
  await page.getByRole('button', { name: /不预推/ }).click();
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.getByPlaceholder('你的姓名').fill('道路相遇探针');
  await page.getByRole('button', { name: '测试灵根' }).click();
  await page.getByRole('button', { name: '降临大千世界' }).click();
  await page.getByRole('button', { name: '大地图', exact: true }).waitFor({ state: 'visible', timeout: 60_000 });
}

async function latestSave(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('taosim_saves', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('saves', 'readonly').objectStore('saves').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result.sort((a, b) => a.header.timestamp - b.header.timestamp).at(-1));
    };
  }));
}

async function installCrossingJourneys(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('taosim_saves', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('saves', 'readonly').objectStore('saves').getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        const payload = read.result.sort((a, b) => a.header.timestamp - b.header.timestamp).at(-1);
        const world = payload.worldState;
        const npc = Object.values(world.npcs).find((item) => item.soulState === 'Active');
        if (!npc) return reject(new Error('隔离世界没有可用的真实 NPC'));
        const now = world.elapsedMinutes ?? 0;
        const duration = 3 * 1440;
        const linkId = 'LINK_NODE_SECT_QINGYUN_NODE_CITY_TIANJI';
        const common = {
          totalDistance: 3,
          remainingDistance: 3,
          distanceTraveled: 0,
          currentSegmentIndex: 0,
          distanceOnCurrentSegment: 0,
          lastAdvancedAtMinutes: now,
          planGeneration: 1,
          movementMode: 'walk',
          speed: 1,
          startedAtMinutes: now,
          estimatedArrivalAtMinutes: now + duration,
          nextCheckpointAtMinutes: now + duration,
          routeRevision: world.spatialState.revision,
          status: 'in_transit',
          interruptionReasons: [],
          encounteredFactIds: [],
        };
        payload.player.spatialAddress = { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'traveling' };
        payload.player.travel = {
          ...common,
          travelId: 'PROBE_PLAYER_QINGYUN_TIANJI',
          entityId: payload.player.id,
          origin: { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'traveling' },
          destination: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
          route: [{ linkId, fromNodeId: 'NODE_SECT_QINGYUN', toNodeId: 'NODE_CITY_TIANJI', distance: 3, kind: 'spatial_link' }],
        };
        npc.spatialAddress = { nodeId: 'NODE_CITY_TIANJI', occupancy: 'traveling' };
        npc.travel = {
          ...common,
          travelId: 'PROBE_NPC_TIANJI_QINGYUN',
          entityId: npc.id,
          origin: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'traveling' },
          destination: { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'stationary' },
          route: [{ linkId, fromNodeId: 'NODE_CITY_TIANJI', toNodeId: 'NODE_SECT_QINGYUN', distance: 3, kind: 'spatial_link' }],
        };
        npc.mind = {
          currentGoal: { type: 'explore' },
          needs: { longevity: 0, social: 80, dao: 20, fame: 0, safety: 20 },
          nextAction: { type: 'socialize' },
        };
        world.activeEncounters = {};
        payload.header.schemaVersion = 10;
        payload.playerMapState.activeLayer = 'Region';
        payload.playerMapState.activeVenueId = null;
        payload.playerMapState.focusedSpatialNodeId = null;
        const write = db.transaction('saves', 'readwrite').objectStore('saves').put(payload);
        write.onerror = () => reject(write.error);
        write.onsuccess = () => resolve({ saveId: payload.header.saveId, npcId: npc.id, npcName: npc.name, now });
      };
    };
  }));
}

async function main() {
  const ownedServer = BASE_URL ? null : await startOwnedVite();
  ownedServerForCleanup = ownedServer;
  const browser = await chromium.launch({ headless: true });
  browserForCleanup = browser;
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  process.stderr.write('[probe] create role world\n');
  await createRoleWorld(page);
  process.stderr.write('[probe] open qingyun settlement\n');
  await page.getByRole('button', { name: /地图格 .*青云宗/ }).click();
  await page.getByRole('button', { name: '查看内部', exact: true }).click();
  const qingyunMap = page.getByRole('application', { name: '青云宗局部地图' });
  await qingyunMap.waitFor({ state: 'visible' });
  const qingyunNodeCount = await qingyunMap.locator('g.cursor-pointer').count();
  const qingyunNames = await qingyunMap.locator('g.cursor-pointer text').evaluateAll((nodes) => nodes.map((node) => node.textContent).filter(Boolean));
  await page.getByRole('button', { name: '区域', exact: true }).click();

  process.stderr.write('[probe] save and install crossing journeys\n');
  await page.getByRole('button', { name: '存读档' }).click();
  await page.getByRole('button', { name: '保存当前进度' }).click();
  await page.getByText('已保存', { exact: true }).waitFor({ state: 'visible' });
  const fixture = await installCrossingJourneys(page);
  await page.getByRole('button', { name: '加载', exact: true }).last().click();
  await page.getByText('已加载', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();

  process.stderr.write('[probe] advance to road encounter\n');
  const dateBeforeEncounter = await page.locator('header').getByText(/道历/).innerText();
  await page.getByRole('button', { name: '快进至抵达', exact: true }).click();
  const encounterCard = page.getByTestId('road-encounter-card');
  await encounterCard.waitFor({ state: 'visible', timeout: 30_000 });
  const encounterText = await encounterCard.innerText();
  const dateAtEncounter = await page.locator('header').getByText(/道历/).innerText();

  process.stderr.write('[probe] save and reload pending encounter\n');
  await page.getByRole('button', { name: '存读档' }).click();
  await page.getByRole('button', { name: '保存当前进度' }).click();
  await page.getByText('已保存', { exact: true }).waitFor({ state: 'visible' });
  const storedEncounterSave = await latestSave(page);
  await page.getByRole('button', { name: '加载', exact: true }).last().click();
  await page.getByText('已加载', { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '关闭', exact: true }).last().click();
  const encounterRestored = await encounterCard.isVisible();

  process.stderr.write('[probe] choose talk\n');
  await encounterCard.getByRole('button', { name: '交谈', exact: true }).click();
  await page.getByRole('button', { name: '切磋', exact: true }).waitFor({ state: 'visible' });
  const npcPanelVisible = await page.getByRole('button', { name: '切磋', exact: true }).isVisible();

  process.stdout.write(`${JSON.stringify({
    qingyunNodeCount,
    qingyunNames,
    fixture,
    dateBeforeEncounter,
    dateAtEncounter,
    encounterText,
    persistedEncounterCount: Object.keys(storedEncounterSave.worldState.activeEncounters ?? {}).length,
    persistedPlayerTravelStatus: storedEncounterSave.player.travel?.status,
    persistedNpcTravelStatus: storedEncounterSave.worldState.npcs[fixture.npcId]?.travel?.status,
    encounterRestored,
    npcPanelVisible,
    errors,
  }, null, 2)}\n`);
  await browser.close();
  browserForCleanup = null;
  ownedServer?.kill();
  ownedServerForCleanup = null;
}

main().catch(async (error) => {
  console.error(error);
  await browserForCleanup?.close().catch(() => undefined);
  ownedServerForCleanup?.kill();
  process.exitCode = 1;
});
