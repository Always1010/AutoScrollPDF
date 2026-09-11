const type = (document.contentType || '').toLowerCase();
const pdfTypes = new Set([
  'application/pdf',
  'application/acrobat',
  'application/nappdf',
  'application/x-pdf',
  'image/pdf',
  'text/pdf',
  'text/x-pdf'
]);

const redirect = () => {
  // allow opening with default PDF viewer
  if (new URLSearchParams(location.search).has('native-view')) {
    return;
  }
  const next = () => {
    const args = new URLSearchParams();
    args.set('file', location.href.split('#')[0]);
    const viewer = chrome.runtime.getURL('/data/pdf.js/web/viewer.html') + '?' + args.toString() + location.hash;

    if (window.top === window) {
      chrome.runtime.sendMessage({
        method: 'open-viewer',
        viewer
      });
    }
    else {
      location.replace(viewer);
    }
  };

  if (window === window.top) {
    next();
  }
  else {
    chrome.storage.local.get({
      frames: false
    }, prefs => {
      if (prefs.frames) {
        next();
      }
    });
  }
};

if (pdfTypes.has(type)) {
  redirect();
}
else if (type === 'application/octet-stream') {
  if (/\.pdf(?:$|[?#])/i.test(location.href)) {
    redirect();
  }
}
