(function () {
  'use strict';
  const snapshots = {}, queues = {}, localBases = {};
  const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  function merge(base, local, remote) {
    if (equal(base, local)) return clone(remote);
    if (!object(base) || !object(local) || !object(remote)) return clone(local);
    const out = clone(remote);
    for (const k of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (!(k in local)) { if (k in base) delete out[k]; }
      else if (!(k in base)) out[k] = clone(local[k]);
      else out[k] = merge(base[k], local[k], remote[k]);
    }
    return out;
  }
  async function json(path, method = 'GET', body) {
    const options = { method, credentials: 'include', headers: {} };
    if (body !== undefined && body !== null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const res = await fetch(path, options);
    let data = {}; try { data = await res.json(); } catch (_) {}
    if (!res.ok || data.ok === false) { const e = new Error(data.error || `请求失败（${res.status}）`); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  const api = { user: null, json, key(name) { if (!api.user || api.user.id == null) throw new Error('请先登录'); return `atlas.user.${encodeURIComponent(String(api.user.id))}.${name}`; } };
  api.ready = json('/api/auth/me').then(r => { if (!r.user || r.user.id == null) throw new Error('请先登录'); api.user = r.user; return r.user; });
  api.load = async function (namespace, fallback) {
    await api.ready;
    const r = await json('/api/state/' + encodeURIComponent(namespace));
    const data = r.data == null ? clone(fallback) : r.data;
    snapshots[namespace] = { data: clone(data), revision: r.revision };
    localBases[namespace] = clone(data);
    return clone(data);
  };
  api.save = function (namespace, data) {
    const desired = clone(data);
    const observed = clone(localBases[namespace]);
    localBases[namespace] = clone(desired);
    const previous = queues[namespace] || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      await api.ready;
      if (!snapshots[namespace]) await api.load(namespace, {});
      let base = snapshots[namespace], value = observed === undefined ? desired : merge(observed, desired, base.data);
      for (let n = 0; n < 5; n++) {
        try {
          const r = await json('/api/state/' + encodeURIComponent(namespace), 'PUT', { data: value, revision: base.revision });
          snapshots[namespace] = { data: clone(r.data), revision: r.revision };
          return clone(r.data);
        } catch (e) {
          if (e.status !== 409 || !e.data || e.data.revision == null) throw e;
          value = merge(base.data, value, e.data.data);
          base = { data: clone(e.data.data), revision: e.data.revision };
        }
      }
      throw new Error('同步冲突次数过多，请重试');
    });
    queues[namespace] = task;
    return task;
  };
  window.AtlasUser = api;
})();
