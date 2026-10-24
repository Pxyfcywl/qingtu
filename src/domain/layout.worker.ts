import { layoutPrepared } from './layout';
self.onmessage = event => {
  const { layout, sequence } = event.data;
  try { self.postMessage({ sequence, positions: layoutPrepared(layout) }); }
  catch (error) { self.postMessage({ sequence, error: String(error) }); }
};
