'use strict';

const status = document.getElementById('status');
const viewer = document.getElementById('viewer');

const showError = error => {
  console.error('[PDF MIME handler]', error);
  status.textContent = 'Unable to open this PDF.';
};

const displayName = originalUrl => {
  try {
    const {pathname} = new URL(originalUrl);
    return decodeURIComponent(pathname.split('/').pop()) || 'document.pdf';
  }
  catch (e) {
    return 'document.pdf';
  }
};

const openStream = async () => {
  if (!chrome.mimeHandler?.getStreamInfo) {
    throw new Error('The browser does not support extension MIME handlers.');
  }

  const stream = await chrome.mimeHandler.getStreamInfo();
  const response = await fetch(stream.streamUrl);
  if (!response.ok) {
    throw new Error(`PDF stream request failed with ${response.status}.`);
  }

  const data = await response.arrayBuffer();
  const blobUrl = URL.createObjectURL(new Blob([data], {type: 'application/pdf'}));
  const viewerUrl = new URL(chrome.runtime.getURL('/data/pdf.js/web/viewer.html'));
  viewerUrl.searchParams.set('file', blobUrl);
  viewerUrl.searchParams.set('source', stream.originalUrl);
  viewerUrl.searchParams.set('name', displayName(stream.originalUrl));
  viewerUrl.searchParams.set('context', stream.embedded ? 'embedded' : 'mime-handler');

  document.title = displayName(stream.originalUrl);
  viewer.addEventListener('load', () => document.body.classList.add('ready'), {once: true});
  viewer.src = viewerUrl.href;
};

openStream().catch(async error => {
  showError(error);
  if (chrome.mimeHandler?.abortAndFallbackToNativeHandler) {
    try {
      await chrome.mimeHandler.abortAndFallbackToNativeHandler();
    }
    catch (fallbackError) {
      showError(fallbackError);
    }
  }
});
