// 画面テスト（Playwright）。ビルド済みの dist を vite preview で配信して、実際のブラウザで遊ぶ
// 使い方：npm run e2e
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const results = [];
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    failed++;
    results.push(`✗ ${name}\n    ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
function assert(ok, msg) { if (!ok) throw new Error(msg); }

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* まだ起動中 */ }
  await new Promise((r) => setTimeout(r, 200));
}

// この作業環境に入っているブラウザがあれば使う（CI では playwright install で入れる）
const local = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  ...(existsSync(local) && !process.env.CI ? { executablePath: local } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function newPage(viewport, settings) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE);
  if (settings) {
    await page.evaluate((s) => {
      localStorage.clear();
      localStorage.setItem('machikado-board/settings-v1', JSON.stringify(s));
    }, settings);
    await page.reload();
  }
  return { page, errors };
}

// 自分の番を最後まで進める（分かれ道・購入・ターン終了）。買ったお店の数を返す
async function playMyTurn(page, { buy = true, viaBoard = false } = {}) {
  let bought = 0;
  let forks = 0;
  await page.getByRole('button', { name: 'サイコロを振る' }).click();
  for (let k = 0; k < 20; k++) {
    await page.waitForTimeout(400);
    const dirs = page.locator('.actions .dirs button');
    if (await dirs.count()) {
      forks++;
      const lit = page.locator('.sq.choice');
      if (viaBoard && await lit.count()) await lit.first().click({ force: true });
      else await dirs.first().click();
      continue;
    }
    const buyBtn = page.locator('.actions button', { hasText: 'で買う' });
    if (buy && await buyBtn.count() && await buyBtn.isEnabled()) { await buyBtn.click(); bought++; continue; }
    const skip = page.locator('.actions button', { hasText: /見送る|増資しない/ });
    if (await skip.count()) { await skip.first().click(); continue; }
    const end = page.locator('.actions button', { hasText: 'ターンを終える' });
    if (await end.count()) { await end.click(); break; }
  }
  // CPU 3 人の番が終わって、また自分の番になるまで待つ
  await page.waitForSelector('.actions button:has-text("サイコロを振る")', { timeout: 90_000 });
  return { bought, forks };
}

const base = { mode: 'normal', cpu: 'normal', name: 'テスト', fast: true, detail: 'low' };

for (const [label, viewport] of [['PC', { width: 1280, height: 900 }], ['スマホ', { width: 390, height: 844 }]]) {
  await step(`${label}：2D で開始して 4 ターン遊び、分かれ道を選んでお店を買える`, async () => {
    const { page, errors } = await newPage(viewport, { ...base, mapId: 'corner', view: '2d' });
    await page.getByRole('button', { name: 'はじめる' }).click();
    let bought = 0, forks = 0;
    for (let i = 0; i < 4; i++) {
      const r = await playMyTurn(page, { viaBoard: i % 2 === 1 });
      bought += r.bought; forks += r.forks;
    }
    assert(forks > 0, '分かれ道に一度も止まらなかった');
    const owned = await page.locator('.sq.owned').count();
    assert(owned >= bought, `買ったお店が盤面に出ていない（${owned}/${bought}）`);
    assert(errors.length === 0, `エラー：${errors.join(' / ')}`);
    await page.close();
  });
}

await step('保存と再開：再読み込みで「つづきから」になり、同じ状態に戻る', async () => {
  const { page, errors } = await newPage({ width: 1280, height: 900 }, { ...base, mapId: 'harbor', view: '2d' });
  await page.getByRole('button', { name: 'はじめる' }).click();
  await playMyTurn(page);
  const cash = await page.locator('.pl').first().locator('.nums b').first().textContent();
  await page.reload();
  const resume = page.getByRole('button', { name: /つづきから/ });
  assert(await resume.count() === 1, '「つづきから」がない');
  await resume.click();
  const after = await page.locator('.pl').first().locator('.nums b').first().textContent();
  assert(after === cash, `現金が戻っていない（${cash} → ${after}）`);
  assert(errors.length === 0, `エラー：${errors.join(' / ')}`);
  await page.close();
});

await step('3D：切り替えると立体の盤面が出て、サイコロを振って遊べる', async () => {
  const { page, errors } = await newPage({ width: 1280, height: 900 }, { ...base, mapId: 'grand', view: '2d' });
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('button', { name: '3D' }).click();
  await page.waitForSelector('.board3d canvas');
  await page.waitForTimeout(800);
  const tris = Number(await page.locator('.board3d').getAttribute('data-triangles'));
  assert(tris > 1000, `三角形が少なすぎる（${tris}）`);
  await playMyTurn(page);
  // 細かさを「高」にすると三角形が増える
  await page.locator('.top select').selectOption('high');
  await page.waitForTimeout(800);
  const hi = Number(await page.locator('.board3d').getAttribute('data-triangles'));
  assert(hi > tris * 3, `細かさを上げても三角形が増えない（${tris} → ${hi}）`);
  assert(errors.length === 0, `エラー：${errors.join(' / ')}`);
  await page.close();
});

await step('遊び方ページ：チャンスカード 20 種とマップの目標が出る', async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/rules.html`);
  await page.waitForSelector('h1:has-text("遊び方")');
  assert(await page.locator('.cards tr').count() === 20, 'カードが 20 種ない');
  assert(await page.locator('text=ちいさな四つ角').count() > 0, 'マップの目標がない');
  await page.close();
});

await browser.close();
server.kill();
console.log(results.join('\n'));
console.log(failed ? `\n${failed} 件失敗` : `\nすべて成功（${results.length} 件）`);
process.exit(failed ? 1 : 0);
