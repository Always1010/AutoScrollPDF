'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(
  __dirname,
  '..',
  'pdf-reader-enhanced',
  'data',
  'viewer',
  'autoscroll',
  'button.js'
);
const source = fs.readFileSync(sourcePath, 'utf8');
const boundary = 'const autoScroll = new AutoScrollController();';
const controllerSource = source.slice(0, source.indexOf(boundary)) +
  '\nglobalThis.TestAutoScrollController = AutoScrollController;';

const createHarness = (mode = 0) => {
  let now = 0;
  let nextAnimationFrame = null;
  const container = {
    clientHeight: 500,
    clientWidth: 500,
    scrollHeight: 5000,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 5000,
    addEventListener() {},
    removeEventListener() {}
  };
  const application = {
    page: 1,
    pagesCount: 5,
    pdfViewer: {
      container,
      scrollMode: mode
    }
  };
  const context = {
    PDFViewerApplication: application,
    cancelAnimationFrame() {},
    chrome: {
      i18n: {
        getMessage() {
          return '';
        }
      }
    },
    console,
    document: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {}
    },
    performance: {
      now() {
        return now;
      }
    },
    requestAnimationFrame(callback) {
      nextAnimationFrame = callback;
      return 1;
    }
  };
  vm.createContext(context);
  vm.runInContext(controllerSource, context, {filename: sourcePath});

  return {
    application,
    container,
    controller: new context.TestAutoScrollController(),
    getNextAnimationFrame: () => nextAnimationFrame,
    setNow: value => {
      now = value;
    }
  };
};

{
  const {container, controller} = createHarness();
  controller.setPixelsPerSecond(40);
  assert.equal(controller.start(), true);
  controller._tick(100);
  for (let timestamp = 200; timestamp <= 1100; timestamp += 100) {
    controller._tick(timestamp);
  }
  assert.equal(container.scrollTop, 40, 'continuous mode should scroll at the configured px/s');
}

{
  const {container, controller} = createHarness();
  controller.setPixelsPerSecond(40);
  controller.start();
  controller._tick(100);
  controller._tick(10100);
  assert.equal(container.scrollTop, 4, 'a long inactive frame should be clamped to 100 ms');
}

{
  const {application, controller} = createHarness(3);
  controller.setPageInterval(2);
  controller.start();
  controller._advancePage(100);
  assert.equal(application.page, 2, 'page mode should advance only one page after a long delay');
  assert.equal(controller._pageAccumulator, 0, 'page timing should reset instead of catching up rapidly');
}

{
  const {controller, setNow} = createHarness();
  controller.start();
  setNow(100);
  controller.pauseForInteraction();
  assert.equal(controller.temporarilyPaused, true);
  setNow(2200);
  assert.equal(controller.temporarilyPaused, false, 'interaction pause should expire after two seconds');
}

console.log('Auto-scroll controller tests passed.');
