(function(window){
  'use strict';

  var map = window.map;
  var hmRadius = document.getElementById('hmRadius'),
      hmBlur   = document.getElementById('hmBlur'),
      hmMin    = document.getElementById('hmMin'),
      hmMax    = document.getElementById('hmMax'),
      hmInvert = document.getElementById('hmInvert'),
      hmClip   = document.getElementById('hmClip'),
      hmFixed  = document.getElementById('hmFixed');
  document.getElementById('hmR').textContent = hmRadius.value;
  document.getElementById('hmB').textContent = hmBlur.value;
  hmRadius.addEventListener('input', function(){ document.getElementById('hmR').textContent = hmRadius.value; if(window.heatLayer) applyHeatFromRaw(); });
  hmBlur  .addEventListener('input', function(){ document.getElementById('hmB').textContent = hmBlur.value; if(window.heatLayer) applyHeatFromRaw(); });
  [hmMin, hmMax, hmInvert, hmClip].forEach(function(el){ el.addEventListener('change', applyHeatFromRaw); });
  hmFixed.addEventListener('change', function(){ if(hmFixed.checked){ hmMin.value=0; hmMax.value=20; hmMin.disabled=true; hmMax.disabled=true; } else { hmMin.disabled=false; hmMax.disabled=false; } applyHeatFromRaw(); });

  var fImpBar=document.getElementById('impBarAll'), fImpPct=document.getElementById('impPctAll'), fImpCount=document.getElementById('impCount');
  function setOverall(done,total){ var pct=Math.round((done/Math.max(1,total))*100); if(fImpCount) fImpCount.textContent=done+'/'+total; if(fImpPct) fImpPct.textContent=pct+'%'; if(fImpBar) fImpBar.style.width=pct+'%'; }

  var heatLayer=null, rawAll=(db.bathy && Array.isArray(db.bathy.points))? db.bathy.points.slice() : [], currentPoints=[];
  function setBathyTotal(n){ var el=document.getElementById('bathyTotal'); if(el) el.textContent=String(n||0); }
  function setHeatCount(n){ var el=document.getElementById('heatCount'); if(el) el.textContent=String(n||0); }

  var autoMin=0, autoMax=0;
  function updateLegend(min,max,inv){ var st=document.getElementById('hmStats'); if(st) st.textContent = 'Min: ' + (min==null?'auto':min) + ' m • Max: ' + (max==null?'auto':max) + ' m'; var lg=document.getElementById('legend'); if(lg){ lg.classList.toggle('inv', !!inv); } }
  function scaleDepth(val,min,max,inv){
    if(min==null||max==null||isNaN(min)||isNaN(max)){
      return 1 - Math.max(0,Math.min(1,(val - autoMin)/((autoMax - autoMin)||1)));
    }
    var t = Math.max(0,Math.min(1,(val - min)/((max - min)||1)));
    return inv ? (1 - t) : t;
  }
  function buildHeat(points){
    if (!window.L || !L.heatLayer || !map || !map._loaded) { return; }
    if(heatLayer){ try{ map.removeLayer(heatLayer); }catch(_){} }
    heatLayer = L.heatLayer(points, {radius: Number(hmRadius.value), blur: Number(hmBlur.value), pane:'heatPane'});
    map.addLayer(heatLayer);
    window.heatLayer = heatLayer;
    setHeatCount(points.length||0);
  }
  function applyHeatFromRaw(){
    if(!map || !map._loaded){ map.whenReady(applyHeatFromRaw); return; }
    currentPoints = [];
    if(!rawAll.length){
      if(heatLayer){ map.removeLayer(heatLayer); heatLayer=null; setHeatCount(0); }
      return;
    }
    var minV = (hmFixed.checked ? 0 : parseFloat(hmMin.value));
    var maxV = (hmFixed.checked ? 20 : parseFloat(hmMax.value));
    var inv  = !!hmInvert.checked;
    var clip = !!hmClip.checked;

    var dmin=Infinity, dmax=-Infinity;
    for(var i=0;i<rawAll.length;i++){ var d=rawAll[i].dep; if(!isNaN(d)){ if(d<dmin)dmin=d; if(d>dmax)dmax=d; } }
    autoMin=dmin; autoMax=dmax;

    var b=map.getBounds();
    for(var j=0;j<rawAll.length;j++){
      var p=rawAll[j];
      if(clip && !(p.lat>=b.getSouth()&&p.lat<=b.getNorth()&&p.lon>=b.getWest()&&p.lon<=b.getEast())) continue;
      var w=scaleDepth(p.dep, isNaN(minV)?null:minV, isNaN(maxV)?null:maxV, inv);
      currentPoints.push([p.lat,p.lon,w]);
    }
    updateLegend(isNaN(minV)?null:minV, isNaN(maxV)?null:maxV, inv);
    buildHeat(currentPoints);
  }
  window.applyHeatFromRaw = applyHeatFromRaw;

  var btnFiles = document.getElementById('btn-import-files'),
      btnDir   = document.getElementById('btn-import-dir'),
      fileInp  = document.getElementById('fileDeeper'),
      dirInp   = document.getElementById('dirDeeper');
  btnFiles.addEventListener('click', function(){ try{ fileInp.value=null; }catch(_){} fileInp.click(); });
  btnDir  .addEventListener('click', function(){ try{ dirInp.value=null; }catch(_){} dirInp.click(); });
  fileInp.addEventListener('change', function(e){ handleFiles([].slice.call(e.target.files||[])); });
  dirInp .addEventListener('change', function(e){ handleFiles([].slice.call(e.target.files||[])); });

  var queueDiv=document.getElementById('queue'); function setQueue(names){ if(queueDiv) queueDiv.textContent = names.join('\n'); }

  function parseCSV(text, seen){
    var lines = text.replace(/\r\n?/g,'\n').split('\n').filter(function(x){return x.trim().length>0;});
    if(lines.length<1) return {points:[], raw:[]};
    var first = lines[0];
    var semi = (first.split(';').length-1) > (first.split(',').length-1);
    var delim = semi ? ';' : ',';
    var header = lines[0].split(delim).map(function(h){return h.trim();});
    var startIdx = 1;

    var iLat = header.findIndex(function(h){return /^latitude$/i.test(h)||/lat/i.test(h);});
    var iLon = header.findIndex(function(h){return /^longitude$/i.test(h)||/(lon|lng)/i.test(h);});
    var iDep = header.findIndex(function(h){return /^depth( ?\(m\))?$/i.test(h)||/^(depth|dep|diepte)/i.test(h);});
    if(iLat<0||iLon<0||iDep<0){ iLat=0;iLon=1;iDep=2; startIdx=0; }

    function toNum(v){ if(v==null) return NaN; v=String(v).trim().replace(/^"(.*)"$/,'$1'); v=v.replace(',', '.'); var n=parseFloat(v); return (Number.isFinite(n)?n:NaN); }

    var rawPts=[], dmin=Infinity, dmax=-Infinity;
    for(var i=startIdx;i<lines.length;i++){
      var cols=lines[i].split(delim);
      var lat=toNum(cols[iLat]), lon=toNum(cols[iLon]), dep=toNum(cols[iDep]);
      if(Number.isFinite(lat)&&Number.isFinite(lon)&&Number.isFinite(dep)){
        if(!(Math.abs(lat)<1e-9 && Math.abs(lon)<1e-9)){
          var k=lat.toFixed(6)+','+lon.toFixed(6)+','+dep.toFixed(2);
          if(!seen.has(k)){ seen.add(k); rawPts.push({lat:lat,lon:lon,dep:dep}); dmin=Math.min(dmin,dep); dmax=Math.max(dmax,dep); }
        }
      }
    }
    autoMin=dmin; autoMax=dmax;

    var minV = (hmFixed && hmFixed.checked) ? 0 : parseFloat(hmMin.value);
    var maxV = (hmFixed && hmFixed.checked) ? 20 : parseFloat(hmMax.value);
    var inv  = !!hmInvert.checked, clip=!!hmClip.checked;
    var b=map.getBounds();

    var out=[];
    for(var t=0;t<rawPts.length;t++){
      var p=rawPts[t];
      if(clip && !(p.lat>=b.getSouth()&&p.lat<=b.getNorth()&&p.lon>=b.getWest()&&p.lon<=b.getEast())) continue;
      var w=scaleDepth(p.dep, isNaN(minV)?null:minV, isNaN(maxV)?null:maxV, inv);
      out.push([p.lat,p.lon,w]);
    }
    updateLegend(isNaN(minV)?null:minV, isNaN(maxV)?null:maxV, inv);
    return {points:out, raw:rawPts};
  }

  function handleFiles(files){
    if(!files.length){ S('No files selected.'); return; }
    S('Preparing: unpacking ZIPs and gathering CSV files…');
    var saveToDB = !!document.getElementById('saveBathy').checked;
    var rawAccumulator=[], seen=new Set(), tasks=[], q=[], done=0, total=0, pendingZips=0;

    for(var i=0;i<files.length;i++){
      (function(f){
        var name=(f.webkitRelativePath||f.name||'unknown');
        if(/\.csv$/i.test(name)){
          tasks.push({label:name, fetchText:function(){ return f.text(); }});
        }else if(/\.zip$/i.test(name)){
          pendingZips++;
          JSZip.loadAsync(f).then(function(zip){
            Object.keys(zip.files).forEach(function(k){
              var zf=zip.files[k];
              if(zf.dir) return;
              if(/\.csv$/i.test(k)){
                tasks.push({label:name+'::'+k, fetchText:function(){ return zf.async('text'); }});
              }
            });
          }).catch(function(){ /* ignore */ })
            .finally(function(){ pendingZips--; if(pendingZips===0) afterEnumerate(); });
        }
      })(files[i]);
    }
    if(pendingZips===0) afterEnumerate();

    function afterEnumerate(){
      q = tasks.map(function(t){ return t.label; });
      total = tasks.length;
      setQueue(q); setOverall(0, Math.max(1,total));
      if(!total){ S('No CSV files found.'); return; }
      S('Import started… ('+total+' CSV files)');

      (function nextTask(idx){
        if(idx>=tasks.length){
          setOverall(total,total);
          if(saveToDB && rawAccumulator.length){
            if(!db.bathy) db.bathy={points:[],datasets:[]};
            var seenDB=new Set();
            for(var i=0;i<(db.bathy.points||[]).length;i++){
              var p=db.bathy.points[i];
              seenDB.add(p.lat.toFixed(6)+','+p.lon.toFixed(6)+','+p.dep.toFixed(2));
            }
            rawAccumulator.forEach(function(p){
              var key=p.lat.toFixed(6)+','+p.lon.toFixed(6)+','+p.dep.toFixed(2);
              if(!seenDB.has(key)){ db.bathy.points.push(p); seenDB.add(key); }
            });
            setBathyTotal(db.bathy.points.length);
            saveDB();
            S('Bathymetry saved to database.');
          }
          rawAll = rawAccumulator.length ? rawAccumulator.slice() : rawAll;
          applyHeatFromRaw();
          return;
        }
        var task = tasks[idx];
        setQueue(q.slice(idx));
        task.fetchText().then(function(text){
          var parsed=parseCSV(text, seen);
          rawAccumulator = rawAccumulator.concat(parsed.raw);
          var pts = parsed.points;
          done++;
          setOverall(done,total);
          if(pts.length){ currentPoints = currentPoints.concat(pts); buildHeat(currentPoints); }
        }).catch(function(){ /* ignore */ done++; setOverall(done,total); })
          .finally(function(){ nextTask(idx+1); });
      })(0);
    }
  }

  document.getElementById('btn-clear-heat').addEventListener('click', function(){
    if(heatLayer){ map.removeLayer(heatLayer); heatLayer=null; currentPoints=[]; setHeatCount(0); S('Heatmap cleared.'); }
  });
  document.getElementById('btn-clear-bathy').addEventListener('click', function(){
    if(!confirm('Erase all bathymetry from the database?')) return;
    db.bathy.points=[]; db.bathy.datasets=[];
    saveDB();
    rawAll=[]; if(heatLayer){ map.removeLayer(heatLayer); heatLayer=null; }
    currentPoints=[]; setBathyTotal(0); setHeatCount(0);
    S('Stored bathymetry removed.');
  });

  map.on('moveend', function(){ if(document.getElementById('hmClip').checked){ applyHeatFromRaw(); } });

  map.whenReady(function(){
    setBathyTotal((db.bathy && Array.isArray(db.bathy.points)) ? db.bathy.points.length : 0);
    if(db.bathy && Array.isArray(db.bathy.points) && db.bathy.points.length){
      rawAll = db.bathy.points.slice();
      applyHeatFromRaw();
    }
  });
})(window);
