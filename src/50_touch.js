/* =====================================================================
   TOUCH CONTROLS (phones/tablets): virtual joystick + action buttons.
   Buttons emit the same keyboard events the desktop game uses, so every
   module (fishing hook/reel, building placement, dialogs) works unchanged.
   ===================================================================== */
(() => {
  const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  G.isTouch = isTouch();

  const fireKey = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  const tap = code => { fireKey('keydown', code); setTimeout(() => fireKey('keyup', code), 30); };
  const busyMode = () => (G.fishing && G.fishing.isFishing && G.fishing.isFishing()) ||
    (G.economy && G.economy._ && typeof G.economy._.placement === 'function' && G.economy._.placement());

  function build() {
    if (!G.isTouch || document.getElementById('touch')) return;
    document.body.classList.add('touch');
    const ui = document.getElementById('ui');
    const t = document.createElement('div'); t.id = 'touch';
    t.innerHTML = `
      <div id="joy"><div id="joy-knob"></div></div>
      <div id="tbtns">
        <button id="tb-use" class="tb big" aria-label="Use tool">USE</button>
        <button id="tb-act" class="tb mid" aria-label="Interact">TALK<br>OPEN</button>
        <button id="tb-inv" class="tb sm" aria-label="Inventory">BAG</button>
        <button id="tb-craft" class="tb sm" aria-label="Crafting">CRAFT</button>
        <button id="tb-help" class="tb sm" aria-label="Help">?</button>
      </div>`;
    ui.appendChild(t);

    // ---- joystick
    const joy = t.querySelector('#joy'), knob = t.querySelector('#joy-knob');
    let jid = null, cx = 0, cy = 0;
    const R = 46;
    const setDir = (dx, dy) => {
      const k = G.input.keys, d = Math.hypot(dx, dy);
      k.KeyW = k.KeyS = k.KeyA = k.KeyD = false;
      if (d > 12) {
        const a = Math.atan2(dy, dx); // 8-way
        const oct = Math.round(a / (Math.PI / 4));
        const map = { 0: 'D', 1: 'DS', 2: 'S', 3: 'SA', 4: 'A', '-4': 'A', '-3': 'AW', '-2': 'W', '-1': 'WD' };
        for (const c of (map[oct] || '')) k['Key' + c] = true;
        G.input.mouse.lastMove = 0; // face the way you walk, not the last tap
      }
      const m = Math.min(d, R), ang = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(ang) * m}px, ${Math.sin(ang) * m}px)`;
    };
    joy.addEventListener('touchstart', e => {
      e.preventDefault(); const tt = e.changedTouches[0]; jid = tt.identifier;
      const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      setDir(tt.clientX - cx, tt.clientY - cy);
    }, { passive: false });
    joy.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const tt of e.changedTouches) if (tt.identifier === jid) setDir(tt.clientX - cx, tt.clientY - cy);
    }, { passive: false });
    const endJoy = e => { for (const tt of e.changedTouches) if (tt.identifier === jid) { jid = null; setDir(0, 0); knob.style.transform = ''; } };
    joy.addEventListener('touchend', endJoy); joy.addEventListener('touchcancel', endJoy);

    // ---- USE: press = Space (hooks fish, places buildings, uses item); hold = repeat tools / reel
    const use = t.querySelector('#tb-use');
    use.addEventListener('touchstart', e => {
      e.preventDefault(); use.classList.add('on');
      fireKey('keydown', 'Space'); G.input.mouseHeld = true;
    }, { passive: false });
    const endUse = e => { e.preventDefault(); use.classList.remove('on'); G.input.mouseHeld = false; fireKey('keyup', 'Space'); };
    use.addEventListener('touchend', endUse); use.addEventListener('touchcancel', endUse);

    const bindTap = (id, fn) => {
      const b = t.querySelector(id);
      b.addEventListener('touchstart', e => { e.preventDefault(); b.classList.add('on'); fn(); }, { passive: false });
      b.addEventListener('touchend', e => { e.preventDefault(); b.classList.remove('on'); });
    };
    // TALK/OPEN doubles as cancel (reel in / cancel building placement)
    bindTap('#tb-act', () => tap(busyMode() ? 'Escape' : 'KeyE'));
    bindTap('#tb-inv', () => { if (G.ui.modal) G.ui.close(); else tap('Tab'); });
    bindTap('#tb-craft', () => { if (G.ui.modal) G.ui.close(); else tap('KeyC'); });
    bindTap('#tb-help', () => { if (G.ui.modal) G.ui.close(); else tap('KeyH'); });

    // on touch, 'right-click' actions are long-press (contextmenu) — relabel UI text
    const relabel = root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (/right-click/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/right-click/gi, 'long-press'); };
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) relabel(n); }))).observe(ui, { childList: true, subtree: true });
    // hide controls behind full panels/title; show only in-game
    const sync = () => { t.style.display = G.started && !G.ui.modal ? '' : 'none'; requestAnimationFrame(sync); };
    sync();

    // stop the page from scrolling / zooming while playing
    document.addEventListener('touchmove', e => { if (!e.target.closest('.panel-body, .shop-list, #hotbar')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
  }

  G.on('init', () => {
    build();
    if (G.isTouch) G.helpExtra.unshift('<b>On a phone:</b> drag the joystick (bottom left) to walk. <b>USE</b> swings your tool or uses the held item — hold it to keep swinging and to reel in fish. <b>TALK/OPEN</b> talks, opens doors, harvests and sleeps; while fishing or placing a building it cancels. You can also tap a tile next to you to use your tool there. Tap a hotbar slot to pick an item; <b>BAG</b> opens your inventory and skills.');
  });
})();
