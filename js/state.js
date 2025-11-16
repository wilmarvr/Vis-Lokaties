(function(window){
  'use strict';

  var DB_KEY = 'lv_db_main';
  var API_DB_URL = 'api/db.php';
  window.API_DB_URL = API_DB_URL;
  window.DB_KEY = DB_KEY;
  var saveTimer = null;

  window.db = {waters:[],steks:[],rigs:[],bathy:{points:[],datasets:[]},settings:{waterColor:'#33a1ff'}};

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
      var raw = localStorage.getItem(DB_KEY);
      if(raw) window.db = JSON.parse(raw);
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
    else {
      window.db.bathy.points = (window.db.bathy.points||[]).map(function(p){
        return {lat:num(p.lat),lon:num(p.lon),dep:num(p.dep)};
      });
    }
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
    try{ localStorage.setItem(DB_KEY, JSON.stringify(window.db)); }catch(_){ }
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
          if(typeof window.renderAll === 'function'){ window.renderAll(); }
          S('Loaded latest server data.');
        }
      })
      .catch(function(err){ console.warn('Server sync failed', err); });
  };

  loadSnapshot();
  window.normalizeDB();
  syncVersionLabel();
  window.syncFromServer();
})(window);
