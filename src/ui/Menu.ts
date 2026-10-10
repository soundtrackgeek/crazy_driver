export interface MenuItem {
  label: string;
  /** Shown as "< value >" for adjustable rows. */
  value?: string;
  action?: () => void;
  left?: () => void;
  right?: () => void;
  disabled?: boolean;
}

export interface MenuScreen {
  title: string;
  subtitle?: string;
  items: MenuItem[];
  html?: string; // extra content above the items (e.g. results table)
  footer?: string;
  onBack?: () => void;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Retro full-screen menus. Keyboard (arrows / Enter / Esc), mouse/touch and
 * gamepad (d-pad or stick, A to select, B to go back) all work.
 */
export class Menu {
  private root = document.createElement('div');
  private screen: MenuScreen | null = null;
  private index = 0;
  private padRepeat = 0;
  private padHeld = '';
  onMove: (() => void) | null = null;

  constructor() {
    this.root.className = 'menu';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.screen || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const handled = this.command(
        ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', Space: 'ok', Escape: 'back' } as Record<string, string>)[
          e.code
        ],
      );
      if (handled) e.preventDefault();
    });
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!el) return;
      const i = Number(el.dataset.i);
      const dir = (e.target as HTMLElement).dataset.dir;
      this.index = i;
      this.command(dir ?? 'ok');
    });
  }

  get visible() {
    return this.screen !== null;
  }

  show(screen: MenuScreen) {
    this.screen = screen;
    this.index = Math.max(0, screen.items.findIndex((i) => !i.disabled));
    this.root.hidden = false;
    this.render();
  }

  hide() {
    this.screen = null;
    this.root.hidden = true;
  }

  /** Re-render the current screen (after values change). */
  refresh() {
    if (this.screen) this.render();
  }

  private command(cmd: string | undefined) {
    const s = this.screen;
    if (!s || !cmd) return false;
    const items = s.items;
    const item = items[this.index];
    const move = (d: number) => {
      for (let k = 0; k < items.length; k++) {
        this.index = (this.index + d + items.length) % items.length;
        if (!items[this.index].disabled) break;
      }
      this.onMove?.();
      this.render();
    };
    switch (cmd) {
      case 'up':
        move(-1);
        break;
      case 'down':
        move(1);
        break;
      case 'left':
        if (item?.left) {
          item.left();
          this.onMove?.();
          this.render();
        }
        break;
      case 'right':
        if (item?.right) {
          item.right();
          this.onMove?.();
          this.render();
        }
        break;
      case 'ok':
        if (item && !item.disabled) (item.action ?? item.right)?.();
        if (this.screen === s) this.render();
        break;
      case 'back':
        s.onBack?.();
        break;
      default:
        return false;
    }
    return true;
  }

  /** Gamepad navigation, called every frame. */
  pollGamepad(dt: number) {
    if (!this.screen) return;
    let cmd = '';
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (b(12) || ay < -0.6) cmd = 'up';
      else if (b(13) || ay > 0.6) cmd = 'down';
      else if (b(14) || ax < -0.6) cmd = 'left';
      else if (b(15) || ax > 0.6) cmd = 'right';
      else if (b(0) || b(9)) cmd = 'ok';
      else if (b(1)) cmd = 'back';
    }
    if (cmd !== this.padHeld) {
      this.padHeld = cmd;
      this.padRepeat = 0.4;
      if (cmd) this.command(cmd);
    } else if (cmd && cmd !== 'ok' && cmd !== 'back') {
      this.padRepeat -= dt;
      if (this.padRepeat <= 0) {
        this.padRepeat = 0.12;
        this.command(cmd);
      }
    }
  }

  private render() {
    const s = this.screen!;
    this.root.innerHTML = `
      <div class="menu-box">
        <h1>${esc(s.title)}</h1>
        ${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ''}
        ${s.html ?? ''}
        <ul>${s.items
          .map(
            (it, i) => `<li data-i="${i}" class="${i === this.index ? 'sel' : ''} ${it.disabled ? 'off' : ''}">
              <span>${esc(it.label)}</span>${
                it.value !== undefined ? `<span class="val"><b data-dir="left">&#9664;</b> ${esc(it.value)} <b data-dir="right">&#9654;</b></span>` : ''
              }</li>`,
          )
          .join('')}</ul>
        ${s.footer ? `<p class="foot">${s.footer}</p>` : ''}
      </div>`;
  }
}
