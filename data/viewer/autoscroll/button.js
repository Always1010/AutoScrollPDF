/* global PDFViewerApplication */
'use strict';

const ScrollMode = {
  VERTICAL: 0,
  HORIZONTAL: 1,
  WRAPPED: 2,
  PAGE: 3
};

const AUTO_SCROLL_DEFAULTS = {
  autoScrollPixelsPerSecond: 40,
  autoScrollPageInterval: 10,
  autoScrollPauseOnInteraction: true
};

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

const message = (key, substitutions, fallback = '') => {
  const translated = substitutions === undefined || substitutions === null
    ? chrome.i18n.getMessage(key)
    : chrome.i18n.getMessage(key, substitutions);
  return translated || fallback;
};

class AutoScrollController {
  constructor() {
    this.enabled = false;
    this.pixelsPerSecond = AUTO_SCROLL_DEFAULTS.autoScrollPixelsPerSecond;
    this.pageInterval = AUTO_SCROLL_DEFAULTS.autoScrollPageInterval;
    this.pauseOnInteraction = AUTO_SCROLL_DEFAULTS.autoScrollPauseOnInteraction;
    this.lastReason = 'initial';
    this.onStateChange = () => {};
    this.onTimeChange = () => {};

    this._container = null;
    this._rafId = null;
    this._lastFrameTime = 0;
    this._lastTimerUpdate = 0;
    this._scrollAccumulator = 0;
    this._pageAccumulator = 0;
    this._interactionPausedUntil = 0;
    this._wasTemporarilyPaused = false;
    this._lastMode = null;

    this._tick = this._tick.bind(this);
    this._onInteraction = this._onInteraction.bind(this);
    this._onNavigationKey = this._onNavigationKey.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
  }

  get container() {
    try {
      const container = PDFViewerApplication?.pdfViewer?.container;
      if (container) {
        this._container = container;
      }
      return container || null;
    }
    catch (e) {
      return null;
    }
  }

  get scrollMode() {
    try {
      return PDFViewerApplication?.pdfViewer?.scrollMode ?? ScrollMode.VERTICAL;
    }
    catch (e) {
      return ScrollMode.VERTICAL;
    }
  }

  get temporarilyPaused() {
    return this.enabled && performance.now() < this._interactionPausedUntil;
  }

  setPixelsPerSecond(value) {
    this.pixelsPerSecond = clamp(value, 5, 200, AUTO_SCROLL_DEFAULTS.autoScrollPixelsPerSecond);
    this._scrollAccumulator = 0;
    this._emitTime(true);
  }

  setPageInterval(value) {
    this.pageInterval = clamp(value, 2, 30, AUTO_SCROLL_DEFAULTS.autoScrollPageInterval);
    this._pageAccumulator = 0;
    this._emitTime(true);
  }

  setPauseOnInteraction(value) {
    this.pauseOnInteraction = Boolean(value);
    if (!this.pauseOnInteraction) {
      this._interactionPausedUntil = 0;
    }
    this._emitState('settings');
  }

  start() {
    if (this.enabled) {
      return true;
    }

    const container = this.container;
    if (!container) {
      return false;
    }

    this.enabled = true;
    this._lastFrameTime = 0;
    this._lastTimerUpdate = 0;
    this._scrollAccumulator = 0;
    this._pageAccumulator = 0;
    this._interactionPausedUntil = 0;
    this._lastMode = this.scrollMode;
    this._attachInteractionListeners(container);
    this._rafId = requestAnimationFrame(this._tick);
    this._emitState('start');
    this._emitTime(true);
    return true;
  }

  stop(reason = 'manual') {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._detachInteractionListeners();
    this._interactionPausedUntil = 0;
    this._wasTemporarilyPaused = false;
    this._lastFrameTime = 0;
    this._emitState(reason);
    this.onTimeChange(null);
  }

  toggle() {
    if (this.enabled) {
      this.stop();
      return false;
    }
    return this.start();
  }

  pauseForInteraction() {
    if (!this.enabled || !this.pauseOnInteraction) {
      return;
    }

    this._interactionPausedUntil = performance.now() + 2000;
    this._lastFrameTime = 0;
    if (!this._wasTemporarilyPaused) {
      this._wasTemporarilyPaused = true;
      this._emitState('interaction');
    }
  }

  estimateTimeRemaining() {
    if (!this.enabled) {
      return null;
    }

    const container = this.container;
    if (!container) {
      return null;
    }

    const mode = this.scrollMode;
    if (mode === ScrollMode.PAGE) {
      const current = PDFViewerApplication?.page || 1;
      const total = PDFViewerApplication?.pagesCount || 1;
      const remainingPages = Math.max(0, total - current);
      return Math.max(0, remainingPages * this.pageInterval +
        Math.max(0, this.pageInterval - this._pageAccumulator));
    }

    const remainingPixels = mode === ScrollMode.HORIZONTAL
      ? container.scrollWidth - container.scrollLeft - container.clientWidth
      : container.scrollHeight - container.scrollTop - container.clientHeight;
    return Math.max(0, remainingPixels / this.pixelsPerSecond);
  }

  _attachInteractionListeners(container) {
    container.addEventListener('wheel', this._onInteraction, {passive: true, capture: true});
    container.addEventListener('pointerdown', this._onInteraction, {passive: true, capture: true});
    container.addEventListener('pointermove', this._onInteraction, {passive: true, capture: true});
    document.addEventListener('keydown', this._onNavigationKey, true);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  _detachInteractionListeners() {
    if (this._container) {
      this._container.removeEventListener('wheel', this._onInteraction, true);
      this._container.removeEventListener('pointerdown', this._onInteraction, true);
      this._container.removeEventListener('pointermove', this._onInteraction, true);
    }
    document.removeEventListener('keydown', this._onNavigationKey, true);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  _onInteraction(event) {
    if (event.type !== 'pointermove' || event.buttons !== 0) {
      this.pauseForInteraction();
    }
  }

  _onNavigationKey(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']
      .includes(event.key)) {
      this.pauseForInteraction();
    }
  }

  _onVisibilityChange() {
    this._lastFrameTime = 0;
    this._pageAccumulator = Math.min(this._pageAccumulator, this.pageInterval);
  }

  _tick(timestamp) {
    if (!this.enabled) {
      return;
    }

    const mode = this.scrollMode;
    if (mode !== this._lastMode) {
      this._lastMode = mode;
      this._scrollAccumulator = 0;
      this._pageAccumulator = 0;
      this._emitState('mode');
      this._emitTime(true);
    }

    if (document.hidden || this.temporarilyPaused) {
      this._lastFrameTime = 0;
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    if (this._wasTemporarilyPaused) {
      this._wasTemporarilyPaused = false;
      this._emitState('resume');
    }

    if (this._lastFrameTime === 0) {
      this._lastFrameTime = timestamp;
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    const deltaSeconds = Math.min(0.1, Math.max(0, (timestamp - this._lastFrameTime) / 1000));
    this._lastFrameTime = timestamp;

    const container = this.container;
    if (!container) {
      this._rafId = requestAnimationFrame(this._tick);
      return;
    }

    if (mode === ScrollMode.PAGE) {
      this._advancePage(deltaSeconds);
    }
    else {
      this._advanceContinuous(container, mode, deltaSeconds);
    }

    if (!this.enabled) {
      return;
    }

    this._emitTime(false, timestamp);
    this._rafId = requestAnimationFrame(this._tick);
  }

  _advancePage(deltaSeconds) {
    this._pageAccumulator += deltaSeconds;
    if (this._pageAccumulator < this.pageInterval) {
      return;
    }

    this._pageAccumulator = 0;
    const currentPage = PDFViewerApplication?.page;
    const totalPages = PDFViewerApplication?.pagesCount;
    if (currentPage && totalPages && currentPage < totalPages) {
      PDFViewerApplication.page = currentPage + 1;
    }
    else {
      this.stop('complete');
    }
  }

  _advanceContinuous(container, mode, deltaSeconds) {
    this._scrollAccumulator += this.pixelsPerSecond * deltaSeconds;
    const wholePixels = Math.trunc(this._scrollAccumulator);
    if (wholePixels === 0) {
      return;
    }
    this._scrollAccumulator -= wholePixels;

    const horizontal = mode === ScrollMode.HORIZONTAL;
    const position = horizontal ? container.scrollLeft : container.scrollTop;
    const maximum = horizontal
      ? container.scrollWidth - container.clientWidth
      : container.scrollHeight - container.clientHeight;

    if (position >= maximum - 1) {
      this.stop('complete');
      return;
    }

    const nextPosition = Math.min(maximum, position + wholePixels);
    if (horizontal) {
      container.scrollLeft = nextPosition;
    }
    else {
      container.scrollTop = nextPosition;
    }

    if (nextPosition >= maximum - 1) {
      this.stop('complete');
    }
  }

  _emitState(reason) {
    this.lastReason = reason;
    this.onStateChange({
      enabled: this.enabled,
      temporarilyPaused: this.temporarilyPaused,
      mode: this.scrollMode,
      reason
    });
  }

  _emitTime(force, timestamp = performance.now()) {
    if (!this.enabled) {
      return;
    }
    if (!force && timestamp - this._lastTimerUpdate < 1000) {
      return;
    }
    this._lastTimerUpdate = timestamp;
    this.onTimeChange(this.estimateTimeRemaining());
  }
}

const autoScroll = new AutoScrollController();

document.addEventListener('DOMContentLoaded', () => {
  const anchor = document.querySelector('.toolbar #editorStamp');
  if (!anchor) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'autoScrollWrapper';
  wrapper.className = 'toolbarButtonWithContainer autoScrollWrapper';

  const button = document.createElement('button');
  button.className = 'toolbarButton autoScrollButton';
  button.type = 'button';
  button.disabled = true;
  button.setAttribute('aria-pressed', 'false');

  const buttonLabel = document.createElement('span');
  button.appendChild(buttonLabel);

  const settingsButton = document.createElement('button');
  settingsButton.className = 'toolbarButton autoScrollSettingsButton';
  settingsButton.type = 'button';
  settingsButton.setAttribute('aria-expanded', 'false');
  settingsButton.setAttribute('aria-haspopup', 'true');
  settingsButton.setAttribute('aria-controls', 'autoScrollPanel');
  settingsButton.title = message('auto_scroll_settings', null, 'Auto-scroll settings');
  settingsButton.setAttribute('aria-label', settingsButton.title);
  settingsButton.appendChild(document.createElement('span'));

  const panel = document.createElement('div');
  panel.id = 'autoScrollPanel';
  panel.className = 'editorParamsToolbar doorHangerRight menu autoScrollPanel hidden';
  panel.hidden = true;

  const panelContent = document.createElement('div');
  panelContent.className = 'menuContainer autoScrollPanelContent';

  const header = document.createElement('div');
  header.className = 'autoScrollHeader';
  const heading = document.createElement('strong');
  heading.textContent = message('auto_scroll_title', null, 'Auto scroll');
  const state = document.createElement('span');
  state.className = 'autoScrollState';
  header.append(heading, state);

  const modeRow = document.createElement('div');
  modeRow.className = 'autoScrollModeRow';
  const modeLabel = document.createElement('span');
  modeLabel.textContent = message('auto_scroll_mode', null, 'Mode');
  const modeValue = document.createElement('span');
  modeRow.append(modeLabel, modeValue);

  const speedHeader = document.createElement('div');
  speedHeader.className = 'autoScrollSpeedHeader';
  const speedLabel = document.createElement('label');
  speedLabel.htmlFor = 'autoScrollSpeedSlider';
  const speedValue = document.createElement('output');
  speedValue.htmlFor = 'autoScrollSpeedSlider';
  speedHeader.append(speedLabel, speedValue);

  const controlRow = document.createElement('div');
  controlRow.className = 'autoScrollControlRow';
  const slowerButton = document.createElement('button');
  slowerButton.className = 'autoScrollStepButton';
  slowerButton.type = 'button';
  slowerButton.textContent = '−';
  slowerButton.setAttribute('aria-label', message('auto_scroll_decrease', null, 'Decrease'));
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'autoScrollSpeedSlider';
  const fasterButton = document.createElement('button');
  fasterButton.className = 'autoScrollStepButton';
  fasterButton.type = 'button';
  fasterButton.textContent = '+';
  fasterButton.setAttribute('aria-label', message('auto_scroll_increase', null, 'Increase'));
  controlRow.append(slowerButton, slider, fasterButton);

  const rangeLabels = document.createElement('div');
  rangeLabels.className = 'autoScrollRangeLabels';
  const rangeStart = document.createElement('span');
  const rangeEnd = document.createElement('span');
  rangeLabels.append(rangeStart, rangeEnd);

  const interactionRow = document.createElement('label');
  interactionRow.className = 'autoScrollInteractionRow';
  const pauseCheckbox = document.createElement('input');
  pauseCheckbox.type = 'checkbox';
  pauseCheckbox.checked = autoScroll.pauseOnInteraction;
  const interactionText = document.createElement('span');
  interactionText.textContent = message(
    'auto_scroll_pause_interaction',
    null,
    'Pause briefly while scrolling or selecting text'
  );
  interactionRow.append(pauseCheckbox, interactionText);

  panelContent.append(header, modeRow, speedHeader, controlRow, rangeLabels, interactionRow);
  panel.appendChild(panelContent);
  wrapper.append(button, settingsButton, panel);
  anchor.after(wrapper);

  const timer = document.createElement('span');
  timer.id = 'autoScrollTimer';
  timer.className = 'toolbarLabel autoScrollTimer';
  timer.hidden = true;
  wrapper.after(timer);

  let configuredMode = null;
  let saveTimer = null;

  const modeNames = {
    [ScrollMode.VERTICAL]: ['auto_scroll_mode_vertical', 'Vertical'],
    [ScrollMode.HORIZONTAL]: ['auto_scroll_mode_horizontal', 'Horizontal'],
    [ScrollMode.WRAPPED]: ['auto_scroll_mode_wrapped', 'Wrapped'],
    [ScrollMode.PAGE]: ['auto_scroll_mode_page', 'Page']
  };

  const formatClock = seconds => {
    const rounded = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    return hours > 0
      ? [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':')
      : [minutes, secs].map(value => String(value).padStart(2, '0')).join(':');
  };

  const configureSlider = mode => {
    if (configuredMode === mode) {
      return;
    }
    configuredMode = mode;
    const pageMode = mode === ScrollMode.PAGE;
    slider.min = pageMode ? '2' : '5';
    slider.max = pageMode ? '30' : '200';
    slider.step = pageMode ? '1' : '5';
    slider.value = String(pageMode ? autoScroll.pageInterval : autoScroll.pixelsPerSecond);
    speedLabel.textContent = message(
      pageMode ? 'auto_scroll_page_interval' : 'auto_scroll_speed',
      null,
      pageMode ? 'Time per page' : 'Scroll speed'
    );
    rangeStart.textContent = pageMode ? '2 s' : message('auto_scroll_slow', null, 'Slow');
    rangeEnd.textContent = pageMode ? '30 s' : message('auto_scroll_fast', null, 'Fast');
  };

  const updateSpeedValue = () => {
    const pageMode = autoScroll.scrollMode === ScrollMode.PAGE;
    speedValue.value = pageMode
      ? message('auto_scroll_seconds', String(autoScroll.pageInterval), `${autoScroll.pageInterval} s`)
      : `${autoScroll.pixelsPerSecond} px/s`;
    speedValue.textContent = speedValue.value;
  };

  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({
      autoScrollPixelsPerSecond: autoScroll.pixelsPerSecond,
      autoScrollPageInterval: autoScroll.pageInterval,
      autoScrollPauseOnInteraction: autoScroll.pauseOnInteraction
    }), 200);
  };

  const renderState = ({enabled, temporarilyPaused, mode, reason} = {
    enabled: autoScroll.enabled,
    temporarilyPaused: autoScroll.temporarilyPaused,
    mode: autoScroll.scrollMode,
    reason: autoScroll.lastReason
  }) => {
    configureSlider(mode);
    updateSpeedValue();
    const [modeKey, modeFallback] = modeNames[mode] || modeNames[ScrollMode.VERTICAL];
    modeValue.textContent = message(modeKey, null, modeFallback);

    const completed = reason === 'complete';
    const stateKey = completed
      ? 'auto_scroll_completed'
      : temporarilyPaused
        ? 'auto_scroll_interaction_paused'
        : enabled
          ? 'auto_scroll_playing'
          : 'auto_scroll_stopped';
    const stateFallback = completed
      ? 'Completed'
      : temporarilyPaused
        ? 'Paused briefly'
        : enabled
          ? 'Playing'
          : 'Paused';
    state.textContent = message(stateKey, null, stateFallback);
    state.dataset.state = completed ? 'complete' : temporarilyPaused ? 'waiting' : enabled ? 'playing' : 'stopped';

    button.classList.toggle('toggled', enabled);
    button.classList.toggle('temporarilyPaused', temporarilyPaused);
    button.setAttribute('aria-pressed', String(enabled));
    button.title = message(
      enabled ? 'auto_scroll_pause_title' : 'auto_scroll_start_title',
      null,
      enabled ? 'Pause auto scroll (Ctrl/Command + Shift + A)' : 'Start auto scroll (Ctrl/Command + Shift + A)'
    );
    buttonLabel.textContent = button.title;

    if (!enabled) {
      timer.hidden = true;
      timer.textContent = '';
    }
  };

  const showPanel = () => {
    panel.classList.remove('hidden');
    panel.hidden = false;
    settingsButton.setAttribute('aria-expanded', 'true');
    renderState();
  };

  const hidePanel = () => {
    panel.classList.add('hidden');
    panel.hidden = true;
    settingsButton.setAttribute('aria-expanded', 'false');
  };

  autoScroll.onStateChange = renderState;
  autoScroll.onTimeChange = seconds => {
    if (!autoScroll.enabled || !Number.isFinite(seconds)) {
      timer.hidden = true;
      timer.textContent = '';
      return;
    }
    const clock = formatClock(seconds);
    timer.hidden = false;
    timer.textContent = `≈ ${clock}`;
    timer.title = message('auto_scroll_remaining', clock, `About ${clock} left`);
    timer.setAttribute('aria-label', timer.title);
  };

  button.addEventListener('click', event => {
    event.stopPropagation();
    autoScroll.toggle();
  });

  settingsButton.addEventListener('click', event => {
    event.stopPropagation();
    panel.hidden ? showPanel() : hidePanel();
  });

  slider.addEventListener('input', () => {
    if (autoScroll.scrollMode === ScrollMode.PAGE) {
      autoScroll.setPageInterval(slider.value);
    }
    else {
      autoScroll.setPixelsPerSecond(slider.value);
    }
    updateSpeedValue();
    scheduleSave();
  });

  const stepSlider = direction => {
    slider.value = String(clamp(
      Number(slider.value) + direction * Number(slider.step),
      Number(slider.min),
      Number(slider.max),
      Number(slider.value)
    ));
    slider.dispatchEvent(new Event('input', {bubbles: true}));
  };
  slowerButton.addEventListener('click', () => stepSlider(-1));
  fasterButton.addEventListener('click', () => stepSlider(1));

  pauseCheckbox.addEventListener('change', () => {
    autoScroll.setPauseOnInteraction(pauseCheckbox.checked);
    scheduleSave();
  });

  document.addEventListener('click', event => {
    if (!wrapper.contains(event.target)) {
      hidePanel();
    }
  });

  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      hidePanel();
      settingsButton.focus();
    }
  });

  document.addEventListener('document-open', () => {
    autoScroll.stop('document');
    button.disabled = true;
  });

  chrome.storage.local.get(AUTO_SCROLL_DEFAULTS, preferences => {
    autoScroll.setPixelsPerSecond(preferences.autoScrollPixelsPerSecond);
    autoScroll.setPageInterval(preferences.autoScrollPageInterval);
    autoScroll.setPauseOnInteraction(preferences.autoScrollPauseOnInteraction);
    pauseCheckbox.checked = autoScroll.pauseOnInteraction;
    configuredMode = null;
    renderState();
  });

  const enableForDocument = () => {
    button.disabled = false;
    renderState();
  };
  const ready = PDFViewerApplication?.initializedPromise || Promise.resolve();
  ready.then(() => {
    if (PDFViewerApplication?.pdfDocument) {
      enableForDocument();
    }
    PDFViewerApplication?.eventBus?.on('documentloaded', enableForDocument);
  }).catch(error => console.error('[Auto scroll] Viewer initialization failed', error));
});
