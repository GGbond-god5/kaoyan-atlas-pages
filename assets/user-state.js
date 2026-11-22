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
  const api = { user: null, guest: false, json, key(name) { const id = (!api.user || api.user.id == null) ? 'guest' : String(api.user.id); return `atlas.user.${encodeURIComponent(id)}.${name}`; } };
  // 游客（未登录）状态走 localStorage 本地存取，与参赛版同口径；登录态判定仍以 ready 的成败为准，不改变各页登录检测。
  function localLoad(namespace, fallback) {
    try {
      const raw = localStorage.getItem(api.key(namespace));
      const data = raw == null ? clone(fallback) : JSON.parse(raw);
      snapshots[namespace] = { data: clone(data), revision: 0 };
      localBases[namespace] = clone(data);
      return clone(data);
    } catch (_) { return clone(fallback); }
  }
  function localSave(namespace, data) {
    const v = clone(data);
    localBases[namespace] = clone(v);
    try { localStorage.setItem(api.key(namespace), JSON.stringify(v)); } catch (_) {}
    return Promise.resolve(clone(v));
  }
  if (window.ATLAS_CONTEST) {
    // 参赛版（纯静态托管、无后端）：状态只走 localStorage，api.json 直接报错由调用方按离线处理。
    api.user = { id: 'guest', name: '游客' };
    api.ready = Promise.resolve(api.user);
    api.json = async function () { throw new Error('参赛演示版：此功能需在正式版登录使用'); };
    api.load = async function (namespace, fallback) {
      try {
        const raw = localStorage.getItem(api.key(namespace));
        const data = raw == null ? clone(fallback) : JSON.parse(raw);
        snapshots[namespace] = { data: clone(data), revision: 0 };
        localBases[namespace] = clone(data);
        return clone(data);
      } catch (_) { return clone(fallback); }
    };
    api.save = function (namespace, data) {
      const v = clone(data);
      localBases[namespace] = clone(v);
      try { localStorage.setItem(api.key(namespace), JSON.stringify(v)); } catch (_) {}
      return Promise.resolve(clone(v));
    };
    window.AtlasUser = api;
    return;
  }
  api.ready = json('/api/auth/me').then(r => { if (!r.user || r.user.id == null) { api.guest = true; throw new Error('请先登录'); } api.user = r.user; return r.user; });
  api.load = async function (namespace, fallback) {
    const user = await api.ready.catch(() => null);
    if (!user) return localLoad(namespace, fallback);
    const r = await json('/api/state/' + encodeURIComponent(namespace));
    const data = r.data == null ? clone(fallback) : r.data;
    snapshots[namespace] = { data: clone(data), revision: r.revision };
    localBases[namespace] = clone(data);
    return clone(data);
  };
  api.save = function (namespace, data) {
    if (api.guest) return localSave(namespace, data);
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
