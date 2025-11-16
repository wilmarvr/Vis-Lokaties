(function(window){
  'use strict';

  var DB_KEY = 'lv_db_main';
  var API_DB_URL = 'api/db.php';
  window.API_DB_URL = API_DB_URL;
  window.DB_KEY = DB_KEY;
  var saveTimer = null;

  window.db = {waters:[],steks:[],rigs:[],bathy:{points:[],datasets:[]},settings:{waterColor:'#33a1ff'}};
  var usedLocalFallback = false;

  function cacheBrowserSnapshot(){
    try{ localStorage.setItem(DB_KEY, JSON.stringify(window.db)); }
    catch(_){ }
  }

  function tryLoadBrowserSnapshot(){
    try{
      var raw = localStorage.getItem(DB_KEY);
      if(raw){
        window.db = JSON.parse(raw);
        usedLocalFallback = true;
        return true;
      }
    }catch(_){ }
    return false;
  }

  function syncVersionLabel(){
    var versionMeta = document.querySelector('meta[name="app-version"]');
    var fallback = versionMeta ? versionMeta.content : '';
    var label = document.getElementById('appVersion');
    if(label && fallback){ label.textContent = fallback; }
    try{
      fetch('version.json', {cache:'no-store'})
        .then(function(res){ return res.ok ? res.json() : null; })
        .then(function(data){
          if(!data || !data.version) return;
          if(label){ label.textContent = data.version; }
          document.title = 'Vis Lokaties ' + data.version;
        })
        .catch(function(){});
    }catch(_){ }
  }

  function loadSnapshot(){
    try{
      var snapEl = document.getElementById('lv_db_snapshot');
      if(snapEl && snapEl.textContent && snapEl.textContent.trim() && snapEl.textContent.trim() !== '{}'){
        window.db = JSON.parse(snapEl.textContent);
        return;
      }
      if(window.APP_DB_READY === false){
        tryLoadBrowserSnapshot();
      }
    }catch(_){ }
  }

  window.normalizeDB = function normalizeDB(){
    function num(v){ return (typeof v === 'string') ? parseFloat(v) : v; }
    window.db.steks = (window.db.steks || []).map(function(s){
      return {id:s.id||uid('stek'),name:s.name||'',note:s.note||'',lat:num(s.lat),lng:num(s.lng),waterId:s.waterId||null};
    });
    window.db.rigs = (window.db.rigs || []).map(function(r){
      return {id:r.id||uid('rig'),name:r.name||'',note:r.note||'',lat:num(r.lat),lng:num(r.lng),stekId:r.stekId||null,waterId:r.waterId||null};
    });
    if(!window.db.waters) window.db.waters = [];
    if(!window.db.bathy) window.db.bathy = {points:[],datasets:[]};

    var bathy = window.db.bathy;
    var normalizedDatasets = [];
    var seen = new Set();
    if(Array.isArray(bathy.datasets)){
      bathy.datasets.forEach(function(ds){
        if(!ds || typeof ds !== 'object') return;
        var id = (ds.id && String(ds.id).trim()) || uid('dataset');
        while(seen.has(id)) id = uid('dataset');
        seen.add(id);
        normalizedDatasets.push({
          id:id,
          label:ds.label || ds.name || ds.title || id,
          source:ds.source || ds.origin || 'deeper',
          importedAt:ds.importedAt || ds.createdAt || null,
          pointCount:Number(ds.pointCount || ds.count || 0),
          depthRange:ds.depthRange || ds.depth || null,
          bbox:ds.bbox || ds.bounds || null,
          generated:!!ds.generated
        });
      });
    }

    var fallbackId = normalizedDatasets.length ? normalizedDatasets[0].id : null;
    var nowIso = (new Date()).toISOString();
    bathy.points = (bathy.points||[]).map(function(p){
      var dsId = (p && p.dataset_id && String(p.dataset_id).trim()) || fallbackId;
      if(!dsId){
        dsId = uid('dataset');
        fallbackId = dsId;
        normalizedDatasets.push({
          id:dsId,
          label:'Migrated bathymetry',
          source:'unknown',
          importedAt:nowIso,
          pointCount:0,
          depthRange:null,
          bbox:null,
          generated:true
        });
      }
      return {lat:num(p.lat),lon:num(p.lon),dep:num(p.dep),dataset_id:dsId};
    });

    var counts = {};
    bathy.points.forEach(function(p){ counts[p.dataset_id] = (counts[p.dataset_id]||0)+1; });
    normalizedDatasets = normalizedDatasets.map(function(ds){
      ds.pointCount = counts[ds.id] || ds.pointCount || 0;
      if(!ds.importedAt) ds.importedAt = nowIso;
      return ds;
    });
    bathy.datasets = normalizedDatasets;
    window.db.bathy = bathy;
  };

  function pushDbToServer(){
    if(window.APP_DB_READY === false){
      var offlineErr = new Error('Database not configured yet.');
      console.warn('Skipping save because DB is offline.');
      S('Server offline – saved only in browser.');
      return Promise.reject(offlineErr);
    }

    return fetch(API_DB_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(window.db)
    }).then(function(res){
      if(!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(body){
          var msg = body && body.error ? body.error : ('HTTP ' + res.status);
          throw new Error(msg);
        });
      }
      return res.json().catch(function(){ return {}; });
    }).then(function(body){
      if(body && body.ok){
        S('Saved to server.');
        return body;
      }
      var errMsg = body && body.error ? body.error : 'Server rejected payload.';
      throw new Error(errMsg);
    }).catch(function(err){
      console.error('Server save failed', err);
      S('Server save failed: ' + err.message);
      throw err;
    });
  }

  window.saveDB = function saveDB(){
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){ pushDbToServer(); }, 400);
    cacheBrowserSnapshot();
  };

  window.syncFromServer = function syncFromServer(){
    if(window.APP_DB_READY === false){
      S('Server offline – using browser data.');
      return Promise.resolve();
    }
    return fetch(API_DB_URL, {cache:'no-store'})
      .then(function(res){ if(!res.ok) throw new Error('Bad status ' + res.status); return res.json(); })
      .then(function(remote){
        if(remote && typeof remote === 'object'){
          window.db = remote;
          window.normalizeDB();
          cacheBrowserSnapshot();
          usedLocalFallback = false;
          if(typeof window.renderAll === 'function'){ window.renderAll(); }
          S('Loaded latest server data.');
        }
      })
      .catch(function(err){
        console.warn('Server sync failed', err);
        if(!usedLocalFallback && tryLoadBrowserSnapshot()){
          window.normalizeDB();
          if(typeof window.renderAll === 'function'){ window.renderAll(); }
          S('Server offline – loaded browser snapshot.');
        }
      });
  };

  loadSnapshot();
  window.normalizeDB();
  syncVersionLabel();
  window.syncFromServer();
})(window);
