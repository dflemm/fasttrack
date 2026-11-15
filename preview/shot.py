import sys, asyncio
from playwright.async_api import async_playwright
page_path, out = sys.argv[1], sys.argv[2]

async def human_turns(pg, limit):
    for _ in range(200):
        await pg.wait_for_timeout(250)
        st = await pg.evaluate("({turn: __ft.state.turn, win: __ft.state.winner, n: __ft.state.moveCount})")
        if st['win'] is not None or st['n'] > limit: break
        if st['turn'] != 0: continue
        cards = pg.locator('#hand .card:not([disabled])')
        if await cards.count() == 0: continue
        done = False
        for i in range(await cards.count()):
            await cards.nth(i).click()
            if await pg.locator('#gOver .opt').count():
                for _ in range(4):
                    opts = pg.locator('#gOver .opt')
                    if await opts.count() == 0: break
                    await opts.first.click(force=True)
                    btn = pg.locator('#prompt .btn.primary')
                    if await btn.count(): await btn.first.click()
                done = True; break
            await cards.nth(i).click()
        if not done:
            await cards.first.click()
            btn = pg.locator('#prompt .btn.primary')
            if await btn.count(): await btn.first.click()

async def wait_me(pg):
    for _ in range(80):
        if await pg.evaluate("__ft.state.turn === 0") and await pg.locator('#hand .card:not([disabled])').count(): return
        await pg.wait_for_timeout(250)

async def overflow(pg):
    return await pg.evaluate("""(() => { const m = document.querySelector('main'), d = document.documentElement;
      const kids = ['turnbar','boardwrap','side','hand','prompt','players'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return id + ':' + Math.round(r.top) + '-' + Math.round(r.bottom); });
      return { vh: innerHeight, doc: d.scrollHeight, main: m.scrollHeight + '/' + m.clientHeight, stage: document.getElementById('stage').clientWidth, kids }; })()""")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errors = []
        pg = await b.new_page(viewport={'width': 1280, 'height': 820})
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto('file://' + page_path)
        await pg.evaluate("__ft.setSpeed('fast'); __ft.newGame(6)")
        await human_turns(pg, 70)
        await wait_me(pg)
        await pg.locator('#hand .card:not([disabled])').first.click()
        await pg.screenshot(path=out + '-desktop.png'); print('desktop', await overflow(pg))
        await pg.click('#histBtn'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=out + '-history.png'); await pg.click('#histClose')
        await pg.click('#optBtn'); await pg.select_option('#themeSel', 'custom'); await pg.wait_for_timeout(100)
        await pg.fill('#col0', '#ff00aa'); await pg.dispatch_event('#col0', 'input'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=out + '-options.png'); await pg.click('#optClose')
        for name, w, h in [('phone', 390, 760), ('landscape', 844, 390), ('small', 360, 640)]:
            await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(400)
            await pg.screenshot(path=out + '-' + name + '.png'); print(name, await overflow(pg))
        print('moves', await pg.evaluate("__ft.state.moveCount"), 'errors', errors)
        await b.close()
asyncio.run(main())
