// 画面テスト（Playwright）。ビルド済みの dist を wrangler dev（オンライン対戦のサーバーつき）で配信して、実際のブラウザで遊ぶ
// 使い方：npm run e2e
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;
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

const server = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', mkdtempSync(join(tmpdir(), 'mb-e2e-'))],
  { stdio: 'ignore', detached: true });
for (let i = 0; i < 150; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* まだ起動中 */ }
  await new Promise((r) => setTimeout(r, 300));
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
    // 自分のコマは 1 つだけ目立たせて「あなた」と出る
    assert(await page.locator('.token.me').count() === 1, '自分のコマの目印がない');
    assert((await page.locator('.token.me').textContent()).includes('あなた'), '自分のコマに「あなた」がない');
    const owned = await page.locator('.sq.owned').count();
    assert(owned >= bought, `買ったお店が盤面に出ていない（${owned}/${bought}）`);
    // 持ち主のいるマスには、利用料のピンが立つ
    const pins = await page.locator('.sq .pin').allTextContents();
    assert(pins.length === owned, `ピンの数が合わない（${pins.length}/${owned}）`);
    assert(pins.every((x) => /^♛?([\d,]+G|休業)$/.test(x)), `ピンの文字がおかしい：${pins.join(' ')}`); // 独占中は王冠付き
    assert(errors.length === 0, `エラー：${errors.join(' / ')}`);
    await page.close();
  });
}

await step('株式市場タブ：銀行で自動で開き、行を押すと 2D の通りが点滅し、終えると盤面に戻る。銀行以外では開かない', async () => {
  const { page, errors } = await newPage({ width: 1280, height: 900 }, { ...base, mapId: 'corner', view: '3d' });
  await page.getByRole('button', { name: 'はじめる' }).click();
  // 銀行のひとつ手前（パン工房）に、銀行へ向かう向きで立たせて、つづきから
  await page.evaluate(() => {
    const k = 'machikado-board/save-v1';
    const s = JSON.parse(localStorage.getItem(k));
    s.players[0].pos = 1; s.players[0].prev = 2;
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload();
  await page.getByRole('button', { name: /つづきから/ }).click();
  await page.getByRole('button', { name: 'サイコロを振る' }).click();
  // 銀行を通る（止まって株式市場）か、銀行に止まる（ターンの終わりに株式市場）
  await page.waitForSelector('.layout.market', { timeout: 15000 });
  assert(await page.locator('.actions button', { hasText: /株の売り買いを終えて進む|ターンを終える/ }).count() === 1, '銀行での操作がない');
  assert(await page.locator('.layout.market').count() === 1, '株式市場タブが開かない');
  assert(await page.locator('.tab.on', { hasText: '株式市場' }).count() === 1, 'タブが選ばれていない');
  await page.locator('.stocks.wide tbody tr').nth(0).click();
  const blink = await page.locator('.sq.blink').count();
  assert(blink === 3, `あさひ通り（3 軒）が点滅しない（${blink}）`);
  await page.locator('.stocks.wide tbody tr').nth(0).click();
  assert(await page.locator('.sq.blink').count() === 0, 'もう一度押しても点滅が止まらない');
  // マップのお店を押すと、その通りの情報が株式市場の表より上に出て、通りが点滅する
  await page.locator('.layout.market .sq[aria-label="パン工房"]').click();
  await page.waitForSelector('.street-info');
  const shopRows = await page.locator('.street-info .shops tbody tr').count();
  assert(shopRows === 3, `あさひ通りのお店の一覧が 3 行でない（${shopRows}）`);
  const above = await page.evaluate(() => document.querySelector('.street-info').getBoundingClientRect().top
    < document.querySelector('.stocks.wide').getBoundingClientRect().top);
  assert(above, '通りの情報が株式市場の表より上にない');
  assert(await page.locator('.sq.blink').count() === 3, 'マップで押した通りが点滅しない');
  await page.getByRole('button', { name: '選択を外す' }).click();
  assert(await page.locator('.street-info').count() === 0, '選択を外しても通りの情報が消えない');
  // 売り買いを終えて進む（銀行を通ったとき）。そのあと銀行以外で止まったら、株式市場は開かない
  for (let k = 0; k < 20; k++) {
    const go = page.locator('.actions button', { hasText: /株の売り買いを終えて進む|見送る|増資しない/ });
    if (await go.count()) { await go.first().click(); await page.waitForTimeout(500); continue; }
    const dirs = page.locator('.actions .dirs button');
    if (await dirs.count()) { await dirs.first().click(); await page.waitForTimeout(500); continue; }
    const end = page.locator('.actions button', { hasText: 'ターンを終える' });
    if (await end.count()) {
      const atBank = (await page.locator('.actions').textContent()).includes('銀行にいるので');
      if (!atBank) assert(await page.locator('.layout.market').count() === 0, '銀行以外なのに株式市場タブが開いた');
      await end.click();
      break;
    }
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('.actions button:has-text("サイコロを振る")', { timeout: 90_000 });
  assert(await page.locator('.board3d').count() === 1, '盤面（3D）に戻らない');
  assert(errors.length === 0, `エラー：${errors.join(' / ')}`);
  await page.close();
});

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
  // スタートの銀行は分かれ道：選べるマスの数だけ、家の上に名前の札が出る
  const st0 = await newPage({ width: 1280, height: 900 }, { ...base, mapId: 'corner', view: '3d' });
  await st0.page.getByRole('button', { name: 'はじめる' }).click();
  await st0.page.getByRole('button', { name: 'サイコロを振る' }).click();
  await st0.page.waitForSelector('.actions .dirs button', { timeout: 15000 });
  await st0.page.waitForTimeout(300);
  const dirs = await st0.page.locator('.actions .dirs button').count();
  const labels = Number(await st0.page.locator('.board3d').getAttribute('data-choices'));
  assert(dirs === 2 && labels === dirs, `分かれ道の札の数が合わない（札 ${labels}・選択肢 ${dirs}）`);
  assert(st0.errors.length === 0, `エラー：${st0.errors.join(' / ')}`);
  await st0.page.close();
  await playMyTurn(page);
  // 1 周すれば、だれかがお店を買っていて、頭上にピンが立つ
  const pins3d = Number(await page.locator('.board3d').getAttribute('data-pins'));
  assert(pins3d >= 1, `3D のピンがない（${pins3d}）`);
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


await step('オンライン：部屋を作って合言葉で入り、2 人で対戦できる（相手の画面に操作が届く）', async () => {
  const errs = [];
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  for (const p of [A, B]) {
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE);
    await p.evaluate((s) => localStorage.setItem('machikado-board/settings-v1', JSON.stringify(s)), { ...base, mapId: 'corner', view: '2d' });
    await p.reload();
  }
  await A.locator('input[aria-label="あなたの名前"]').fill('あい');
  await A.getByRole('button', { name: '合言葉で部屋を作る' }).click();
  await A.waitForSelector('.lobby .code');
  const code = (await A.locator('.lobby .code').textContent()).trim();
  assert(/^[A-Z2-9]{6}$/.test(code), `合言葉が出ない：${code}`);
  await B.locator('input[aria-label="あなたの名前"]').fill('びい');
  await B.locator('input[aria-label="合言葉"]').fill(code);
  await B.getByRole('button', { name: '合言葉で入る' }).click();
  await A.waitForSelector('.seats li:nth-child(2)');
  assert((await A.locator('.seats').textContent()).includes('びい'), '相手の名前が待合室に出ない');
  await A.getByRole('button', { name: 'この人数で始める' }).click();
  await A.waitForSelector('.top .online');
  await B.waitForSelector('.top .online');
  // 最初の手番は A（席 0）。A がサイコロを振ると、B の画面のできごとに出る
  await A.getByRole('button', { name: 'サイコロを振る' }).click();
  await B.waitForFunction(() => document.querySelector('.log')?.textContent?.includes('サイコロは'), null, { timeout: 15000 });
  // B の画面では A の番なので操作できない
  assert(await B.getByRole('button', { name: 'サイコロを振る' }).count() === 0, '相手の番なのに B がサイコロを振れる');
  // 定型メッセージが相手に届く
  await A.locator('.emotes button').first().click();
  await B.waitForSelector('.bubble', { timeout: 10000 });
  // B が再読み込みしても、同じ対戦に戻れる
  await B.reload();
  await B.waitForSelector('.top .online', { timeout: 15000 });
  assert(errs.length === 0, `エラー：${errs.join(' / ')}`);
  await ctxA.close();
  await ctxB.close();
});

await browser.close();
try { process.kill(-server.pid, 'SIGTERM'); } catch { /* もう止まっている */ }
console.log(results.join('\n'));
console.log(failed ? `\n${failed} 件失敗` : `\nすべて成功（${results.length} 件）`);
process.exit(failed ? 1 : 0);
