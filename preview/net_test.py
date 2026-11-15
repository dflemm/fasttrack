# Two browsers, one room: host and guest play each other through a local signalling server.
import sys, asyncio, json
from playwright.async_api import async_playwright
page_path, out = sys.argv[1], sys.argv[2]
INIT = "window.FT_PEER = { host: '127.0.0.1', port: 9000, path: '/', secure: false, config: { iceServers: [] } };"

async def take_turn(pg):
    st = await pg.evaluate("({turn: __ft.state.turn, me: __ft.me, win: __ft.state.winner})")
    if st['win'] is not None or st['turn'] != st['me']: return
    cards = pg.locator('#hand .card:not(.off)')
    n = await cards.count()
    for i in range(n):
        await cards.nth(i).click()
        if await pg.locator('#gOver .opt').count():
            for _ in range(4):
                opts = pg.locator('#gOver .opt')
                if await opts.count() == 0: break
                await opts.first.click(force=True)
                btn = pg.locator('#prompt .btn.primary')
                if await btn.count(): await btn.first.click()
            return
        await cards.nth(i).click()
    if n:
        await cards.first.click()
        btn = pg.locator('#prompt .btn.primary')
        if await btn.count(): await btn.first.click()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--disable-features=WebRtcHideLocalIpsWithMdns'])
        errs = []
        async def mk(w, h):
            ctx = await b.new_context(viewport={'width': w, 'height': h}); await ctx.add_init_script(INIT)
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); return pg
        host, guest = await mk(1100, 760), await mk(390, 760)
        await host.goto('file://' + page_path)
        await host.evaluate("__ft.setSpeed('fast')")
        await host.click('#newBtn'); await host.fill('#nameInp', 'Devin'); await host.check('#modeHost'); await host.select_option('#countSel', '3'); await host.click('#startBtn')
        await host.wait_for_function("document.getElementById('lobbyStatus').textContent.includes('open')", timeout=15000)
        code = await host.inner_text('#roomCode'); print('room', code)
        await guest.goto('file://' + page_path + '#join-' + code)
        await guest.evaluate("__ft.setSpeed('fast')")
        print('join dialog prefilled:', await guest.input_value('#codeInp'))
        await guest.fill('#nameInp', 'Sam'); await guest.click('#startBtn')
        await host.wait_for_function("__ft.net.guests.length === 1", timeout=20000)
        await guest.wait_for_function("__ft.net.lobby && __ft.net.lobby.players.length === 2", timeout=10000)
        await host.screenshot(path=out + '-lobby-host.png'); await guest.screenshot(path=out + '-lobby-guest.png')
        await host.click('#lobbyStart')
        await guest.wait_for_function("__ft.net.started === true", timeout=10000)
        print('players seen by guest:', await guest.evaluate("__ft.state.players.map(p => p.name + (p.bot ? '*' : ''))"), 'guest is player', await guest.evaluate("__ft.me"))
        for _ in range(260):
            await take_turn(host); await take_turn(guest)
            await host.wait_for_timeout(200)
            n = await host.evaluate("__ft.state.moveCount")
            if n >= 45 or await host.evaluate("__ft.state.winner") is not None: break
        await host.wait_for_timeout(4000)
        pegs = "JSON.stringify([__ft.state.moveCount, __ft.state.turn, __ft.state.players.map(p => p.pegs.map(g => g.zone + g.idx))])"
        h, g = await host.evaluate(pegs), await guest.evaluate(pegs)
        print('host ', h[:90]); print('guest', g[:90]); print('boards match:', h == g)
        print('guest sees other hands:', await guest.evaluate("__ft.state.players.map((p, i) => i === __ft.me ? 'own' : p.hand.length)"))
        # rearrange cards while it may not be the guest's turn
        before = await guest.evaluate("[...document.querySelectorAll('#hand .card .rank')].map(x => x.textContent)")
        c0 = guest.locator('#hand .card').first; box = await c0.bounding_box(); last = await guest.locator('#hand .card').last.bounding_box()
        await guest.mouse.move(box['x'] + box['width']/2, box['y'] + 20); await guest.mouse.down(); await guest.mouse.move(last['x'] + last['width'] - 4, box['y'] + 20, steps=8); await guest.mouse.up()
        after = await guest.evaluate("[...document.querySelectorAll('#hand .card .rank')].map(x => x.textContent)")
        print('hand before', before, 'after drag', after)
        await host.screenshot(path=out + '-net-host.png'); await guest.screenshot(path=out + '-net-guest.png')
        # guest drops: a bot should take the seat
        await guest.context.close()
        await host.wait_for_function("__ft.state.players[1].bot === true", timeout=60000)
        print('after guest left, seat 2 is a bot:', await host.evaluate("__ft.state.players[1].bot"))
        print('errors', errs)
        await b.close()
asyncio.run(main())

