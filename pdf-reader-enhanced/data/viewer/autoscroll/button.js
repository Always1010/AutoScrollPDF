/* global PDFViewerApplication */
'use strict';

// ScrollMode enum matching PDF.js internals
const ScrollMode = {
  VERTICAL: 0,
  HORIZONTAL: 1,
  WRAPPED: 2,
  PAGE: 3
};

class AutoScrollController {
  constructor() {
    this.enabled = false;
    this.speed = 50; // 1-100, default medium (50 => 250 px/s, linear)
    this._scrollAccumulator = 0; // sub-pixel scroll accumulator (prevents rounding to zero)
    this._rafId = null;
    this._lastFrameTime = 0;
    this._pageAccumulator = 0; // for PAGE mode timing
    this._lastScrollTop = 0;   // track position after our own scrolls (to detect external ones)
    this._lastScrollLeft = 0;
    this._container = null;
    this._timerEl = null;
    this._onUserScroll = this._onUserScroll.bind(this);
    this._tick = this._tick.bind(this);
  }

  get container() {
    // Always try to get the container (don't cache failures)
    try {
      const c = PDFViewerApplication?.pdfViewer?.container;
      if (c) this._container = c;
      return c || null;
    } catch (e) {
      return null;
    }
  }

  get scrollMode() {
    try {
      return PDFViewerApplication?.pdfViewer?.scrollMode ?? ScrollMode.VERTICAL;
    } catch (e) {
      return ScrollMode.VERTICAL;
    }
  }

  start() {
    if (this.enabled) return;
    const c = this.container;
    if (!c) {
      // PDF.js not ready yet — try again in 500ms
      setTimeout(() => this.start(), 500);
      return;
    }
    this.enabled = true;
    this._lastFrameTime = 0;
    this._pageAccumulator = 0;
    this._scrollAccumulator = 0;
    this._container.addEventListener('scroll', this._onUserScroll, { passive: true });
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._container) {
      this._container.removeEventListener('scroll', this._onUserScroll);
    }
    this._lastScrollTop = 0;
    this._lastScrollLeft = 0;
  }

  toggle() {
    if (this.enabled) {
      this.stop();
    } else {
      this.start();
    }
    return this.enabled;
  }

  setSpeed(n) {
    this.speed = Math.max(1, Math.min(100, Number(n) || 50));
  }

  _tick(timestamp) {
    if (!this.enabled) return;

    if (this._lastFrameTime === 0) {
      this._lastFrameTime = timestamp;
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    const dt = (timestamp - this._lastFrameTime) / 1000; // seconds
    this._lastFrameTime = timestamp;

    const mode = this.scrollMode;
    const container = this.container;
    if (!container) {
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    if (mode === ScrollMode.PAGE) {
      // Page mode: accumulate time, advance page when threshold reached
      const msPerPage = Math.max(500, 30000 / this.speed); // 30s at speed 1, 0.5s at speed 100
      this._pageAccumulator += dt * 1000;

      if (this._pageAccumulator >= msPerPage) {
        this._pageAccumulator -= msPerPage;
        const currentPage = PDFViewerApplication?.page;
        const totalPages = PDFViewerApplication?.pagesCount;
        if (currentPage && totalPages && currentPage < totalPages) {

          PDFViewerApplication.page = currentPage + 1;
        } else {
          // Reached last page
          this.stop();
          this._updateButtonState();
          return;
        }
      }
    } else {
      // Continuous scroll modes: VERTICAL, HORIZONTAL, WRAPPED
      // Linear: speed 1→5px/s, speed 50→250px/s, speed 100→500px/s
      const pixelsPerSecond = this.speed * 5;
      const pixelDelta = pixelsPerSecond * dt;
      // Accumulate sub-pixel scroll amounts so low speeds still move
      this._scrollAccumulator += pixelDelta;
      const wholePixels = Math.trunc(this._scrollAccumulator);
      if (wholePixels === 0) {
        this._rafId = requestAnimationFrame(this._tick);
        return;
      }
      this._scrollAccumulator -= wholePixels;

      if (mode === ScrollMode.HORIZONTAL) {
        const maxScroll = container.scrollWidth - container.clientWidth;
        if (container.scrollLeft >= maxScroll - 1) {
          this.stop();
          this._updateButtonState();
          return;
        }
        container.scrollLeft += wholePixels;
      } else {
        // VERTICAL or WRAPPED: scroll vertically
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (container.scrollTop >= maxScroll - 1) {
          this.stop();
          this._updateButtonState();
          return;
        }
        container.scrollTop += wholePixels;
      }
    }

    // Record actual scroll position so _onUserScroll can distinguish our scrolls
    // from external ones (e.g. PDF.js image-rendering reflows vs. user mouse wheel)
    const c = this.container;
    if (c) {
      this._lastScrollTop = c.scrollTop;
      this._lastScrollLeft = c.scrollLeft;
    }

    this._updateTimeRemaining();
    this._rafId = requestAnimationFrame(this._tick);
  }

  _onUserScroll() {
    // No-op: auto-scroll no longer stops on external scroll events.
    // (Previously tried time-window and position-delta approaches,
    //  both caused false positives with PDF.js internal reflows or
    //  accidental trackpad touches. Use the button or Ctrl+Shift+A to stop.)
  }

  _updateButtonState() {
    const button = document.querySelector('.autoScrollButton');
    const panel = document.getElementById('autoScrollPanel');
    if (button) {
      button.classList.toggle('toggled', this.enabled);
      button.setAttribute('aria-pressed', String(this.enabled));
    }
    if (panel) {
      this.enabled ? panel.classList.remove('hidden') : panel.classList.add('hidden');
      panel.hidden = !this.enabled;
    }
    // Also update timer visibility
    if (this._timerEl) {
      this._timerEl.style.display = this.enabled ? '' : 'none';
    }
  }

  _updateTimeRemaining() {
    if (!this._timerEl) return;
    if (!this.enabled) {
      this._timerEl.style.display = 'none';
      return;
    }
    this._timerEl.style.display = '';
    const container = this.container;
    if (!container) return;

    let timeSec;
    const mode = this.scrollMode;

    if (mode === ScrollMode.PAGE) {
      const current = PDFViewerApplication?.page || 1;
      const total = PDFViewerApplication?.pagesCount || 1;
      const remaining = total - current;
      const msPerPage = Math.max(500, 30000 / this.speed);
      timeSec = (remaining * msPerPage) / 1000;
    } else if (mode === ScrollMode.HORIZONTAL) {
      const remaining = container.scrollWidth - container.scrollLeft - container.clientWidth;
      timeSec = remaining / (this.speed * 5);
    } else {
      // VERTICAL or WRAPPED
      const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
      timeSec = remaining / (this.speed * 5);
    }

    // Format: "3m 15s" or "45s"
    if (timeSec >= 3600) {
      const h = Math.floor(timeSec / 3600);
      const m = Math.floor((timeSec % 3600) / 60);
      this._timerEl.textContent = h + 'h ' + m + 'm';
    } else if (timeSec >= 60) {
      const m = Math.floor(timeSec / 60);
      const s = Math.floor(timeSec % 60);
      this._timerEl.textContent = m + 'm ' + s + 's';
    } else {
      this._timerEl.textContent = Math.floor(timeSec) + 's';
    }
  }
}

// Singleton controller
const autoScroll = new AutoScrollController();

document.addEventListener('DOMContentLoaded', () => {
  // ===== Create the wrapper container (matches toolbarButtonWithContainer pattern) =====
  const wrapper = document.createElement('div');
  wrapper.id = 'autoScrollWrapper';
  wrapper.className = 'toolbarButtonWithContainer';

  // ===== Create the toggle button =====
  const button = document.createElement('button');
  button.className = 'toolbarButton autoScrollButton';
  button.type = 'button';
  button.tabIndex = 0;
  button.title = 'Auto Scroll (Ctrl/Command + Shift + A)\n\nClick to toggle automatic scrolling.\nA speed slider will appear when active.';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-controls', 'autoScrollPanel');
  button.setAttribute('aria-pressed', 'false');

  const span = document.createElement('span');
  span.textContent = 'Auto Scroll';
  button.appendChild(span);

  button.onclick = (e) => {
    e.stopPropagation();
    const isActive = autoScroll.toggle();
    button.classList.toggle('toggled', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.setAttribute('aria-expanded', String(isActive));
    const panel = document.getElementById('autoScrollPanel');
    if (panel) {
      isActive ? showPanel() : hidePanel();
    }
    autoScroll._updateTimeRemaining();
  };

  // ===== Create the speed control panel (doorhanger) =====
  const panel = document.createElement('div');
  panel.id = 'autoScrollPanel';
  panel.className = 'editorParamsToolbar doorHangerRight menu';
  panel.classList.add('hidden');
  panel.hidden = true;
  panel.style.cssText = 'min-width: 280px; padding: 8px;';

  // Helpers: must toggle both CSS class AND HTML attribute (CSS rule: .hidden,[hidden]{display:none!important})
  const showPanel = () => { panel.classList.remove('hidden'); panel.hidden = false; };
  const hidePanel = () => { panel.classList.add('hidden'); panel.hidden = true; };

  const panelContent = document.createElement('div');
  panelContent.className = 'menuContainer';
  panelContent.style.cssText = 'padding: 8px 12px;';

  // Speed label row
  const labelRow = document.createElement('div');
  labelRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

  const label = document.createElement('span');
  label.className = 'editorParamsLabel';
  label.textContent = 'Scroll Speed';
  label.style.cssText = 'color:var(--field-color,#000);font-size:13px;';

  const speedValue = document.createElement('span');
  speedValue.id = 'autoScrollSpeedValue';
  speedValue.textContent = '50';
  speedValue.style.cssText = 'color:var(--field-color,#000);font-weight:bold;font-size:13px;';

  labelRow.appendChild(label);
  labelRow.appendChild(speedValue);

  // Slider + number input row
  const controlRow = document.createElement('div');
  controlRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;';

  // Speed slider
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'autoScrollSpeedSlider';
  slider.min = '1';
  slider.max = '100';
  slider.value = '50';
  slider.step = '1';
  slider.tabIndex = 0;
  slider.style.cssText = 'flex:1;accent-color:var(--button-hover-color,#0060df);';

  // Number input for precise value
  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.id = 'autoScrollSpeedNumber';
  numberInput.min = '1';
  numberInput.max = '100';
  numberInput.value = '50';
  numberInput.step = '1';
  numberInput.tabIndex = 0;
  numberInput.style.cssText = 'width:52px;text-align:center;font-size:13px;padding:2px 4px;' +
    'background-color:var(--field-bg-color,#fff);color:var(--field-color,#000);' +
    'border:1px solid var(--field-border-color,#ccc);border-radius:3px;';

  // Sync slider <-> number input
  const updateFromValue = (val) => {
    val = Math.max(1, Math.min(100, Number(val) || 50));
    slider.value = val;
    numberInput.value = val;
    autoScroll.setSpeed(val);
    speedValue.textContent = val;
  };

  slider.oninput = () => updateFromValue(slider.value);
  numberInput.onchange = () => updateFromValue(numberInput.value);
  numberInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateFromValue(numberInput.value);
    }
  };

  controlRow.appendChild(slider);
  controlRow.appendChild(numberInput);

  // Speed labels (min/max)
  const rangeLabels = document.createElement('div');
  rangeLabels.style.cssText = 'display:flex;justify-content:space-between;font-size:10px;color:var(--field-color,#666);padding:0 2px;';
  rangeLabels.innerHTML = '<span>1 (Slow)</span><span>100 (Fast)</span>';

  panelContent.appendChild(labelRow);
  panelContent.appendChild(controlRow);
  panelContent.appendChild(rangeLabels);
  panel.appendChild(panelContent);

  // ===== Assemble =====
  wrapper.appendChild(button);
  wrapper.appendChild(panel);
  document.querySelector('.toolbar #editorStamp').after(wrapper);

  // Timer label next to the auto-scroll button in toolbar
  const timerSpan = document.createElement('span');
  timerSpan.id = 'autoScrollTimer';
  timerSpan.className = 'toolbarLabel';
  timerSpan.style.cssText = 'display:none;font-size:12px;line-height:var(--toolbar-height,32px);' +
    'padding:0 8px;color:var(--field-color,#555);white-space:nowrap;user-select:none;';
  wrapper.after(timerSpan);
  autoScroll._timerEl = timerSpan;

  // ===== Close panel on outside click =====
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      hidePanel();
      button.setAttribute('aria-expanded', 'false');
    }
  });

  // Button click also toggles panel visibility when already active
  const originalClick = button.onclick;
  button.onclick = (e) => {
    e.stopPropagation();
    originalClick(e);
    // When auto-scroll is active, show the panel
    if (autoScroll.enabled) {
      showPanel();
      button.setAttribute('aria-expanded', 'true');
    }
  };
});
