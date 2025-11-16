(function(window){
  'use strict';

  var map = window.map;
  var selection = window.selectionState;

  document.getElementById('btnSelClear').addEventListener('click', function(){
    selection.points.clear();
    if(selection.preview){ map.removeLayer(selection.preview); selection.preview=null; }
    selection.bestWater=null;
    I('Selection cleared.');
  });

  function generateContours(){
    var pts=(db.bathy&&db.bathy.points)||[];
    if(!pts.length){ S('No bathymetry available.'); return; }
    var bounds=map.getBounds();
    var inView=pts.filter(function(p){ return p.lat>=bounds.getSouth() && p.lat<=bounds.getNorth() && p.lon>=bounds.getWest() && p.lon<=bounds.getEast(); });
    if(inView.length<5){ S('Zoom to an area with at least 5 bathy samples.'); return; }

    var latMin=Infinity,latMax=-Infinity,lonMin=Infinity,lonMax=-Infinity;
    var depMin=Infinity,depMax=-Infinity;
    inView.forEach(function(p){
      if(p.lat<latMin) latMin=p.lat; if(p.lat>latMax) latMax=p.lat;
      if(p.lon<lonMin) lonMin=p.lon; if(p.lon>lonMax) lonMax=p.lon;
      if(p.dep<depMin) depMin=p.dep; if(p.dep>depMax) depMax=p.dep;
    });
    if(!isFinite(depMin)||!isFinite(depMax)||depMin===depMax){ S('Depth range is zero — contours skipped.'); return; }

    var padLat=Math.max(0.0003,(latMax-latMin)*0.05);
    var padLon=Math.max(0.0003,(lonMax-lonMin)*0.05);
    var south=latMin-padLat, north=latMax+padLat, west=lonMin-padLon, east=lonMax+padLon;
    var centerLat=(south+north)/2;
    var latMeters=distM({lat:south,lon:(west+east)/2},{lat:north,lon:(west+east)/2});
    var lonMeters=distM({lat:centerLat,lon:west},{lat:centerLat,lon:east});
    var longest=Math.max(latMeters, lonMeters);
    var cellM=Math.max(8, Math.min(35, longest/80));
    var degPerLat=1/110540;
    var degPerLon=(Math.abs(Math.cos(centerLat*Math.PI/180))>1e-3)?(1/(111320*Math.cos(centerLat*Math.PI/180))):(1/111320);
    var stepLat=cellM*degPerLat;
    var stepLon=cellM*degPerLon;

    var samples=[];
    for(var y=south; y<=north+1e-9; y+=stepLat){
      for(var x=west; x<=east+1e-9; x+=stepLon){
        var val=interpIDW(y,x,inView,60,12);
        if(Number.isFinite(val)) samples.push(turf.point([x,y],{value:val}));
      }
    }
    if(!samples.length){ S('Interpolation failed inside viewport.'); return; }

    var vmin=depMin, vmax=depMax;
    try{
      var uMin=parseFloat(document.getElementById('hmMin').value);
      var uMax=parseFloat(document.getElementById('hmMax').value);
      if(document.getElementById('hmFixed').checked){ vmin=0; vmax=20; }
      else {
        if(!isNaN(uMin)) vmin=Math.max(depMin,uMin);
        if(!isNaN(uMax)) vmax=Math.min(depMax,uMax);
      }
    }catch(_){ }
    if(vmax<=vmin){ S('Contour bounds collapsed.'); return; }
    var range=vmax-vmin;
    var desired=20;
    var step=Math.max(0.2, range/desired);
    var levels=[];
    for(var lvl=vmin; lvl<=vmax+1e-6; lvl+=step){ levels.push(parseFloat(lvl.toFixed(2))); }

    var ptsFC=turf.featureCollection(samples);
    var lines=null;
    try{
      lines=turf.isolines(ptsFC, levels, {zProperty:'value'});
    }catch(e){ console.error(e); S('Isoline generation failed.'); return; }

    contourLayer.clearLayers(); isobandLayer.clearLayers();
    L.geoJSON(lines,{style:{color:'#44f1c6',weight:1.5,opacity:0.9},pane:'contourPane'}).addTo(contourLayer);
    S('Contours ready: '+((lines.features||[]).length)+' isolines.');
  }
  document.getElementById('btn-gen-contours').addEventListener('click', generateContours);
  document.getElementById('btn-clear-contours').addEventListener('click', function(){ contourLayer.clearLayers(); isobandLayer.clearLayers(); S('Contours cleared.'); });

  var gpsWatchId = null;
  function startGPS(){
    if (!navigator.geolocation) { S('GPS is not available in this browser.'); return; }
    if (gpsWatchId != null) return;
    var opts = { enableHighAccuracy:true, maximumAge:2000, timeout:10000 };
    gpsWatchId = navigator.geolocation.watchPosition(function(p){
      var c = p.coords || {};
      document.getElementById('gpsLat').textContent = (p.coords.latitude||0).toFixed(6);
      document.getElementById('gpsLon').textContent = (p.coords.longitude||0).toFixed(6);
      document.getElementById('gpsAcc').textContent = Math.round(c.accuracy||0);
      document.getElementById('gpsSpd').textContent = Math.round((c.speed||0)*10)/10;
      document.getElementById('gpsBrg').textContent = Math.round(c.heading||0);
      document.getElementById('gpsStatus').textContent = 'on';
    }, function(){ stopGPS(); S('GPS: no fix.'); }, opts);
  }
  function stopGPS(){ if (gpsWatchId != null) { try{ navigator.geolocation.clearWatch(gpsWatchId); }catch(_){ } gpsWatchId = null; } document.getElementById('gpsStatus').textContent = 'off'; }
  document.getElementById('btnGps').addEventListener('click', function(){ if(gpsWatchId==null) startGPS(); else stopGPS(); });

  var inlineAssetsPromise=null;
  function ensureInlineAssets(){
    if(!inlineAssetsPromise){
      inlineAssetsPromise=Promise.all([
        fetch('css/styles.css').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
        fetch('js/utils.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
        fetch('js/state.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
        fetch('js/map-core.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
        fetch('js/water-manager.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
        fetch('js/spot-manager.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
        fetch('js/deeper-import.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
        fetch('js/app.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';})
      ]).then(function(res){ return {css:res[0]||'', scripts:res.slice(1).join('\n\n')}; });
    }
    return inlineAssetsPromise;
  }
  function inlineStandaloneAssets(html, assets){
    if(assets.css){ html=html.replace('<link rel="stylesheet" href="css/styles.css">','<style>'+assets.css+'</style>'); }
    if(assets.scripts){
      var bundle = '<script>'+assets.scripts+'</script>';
      var marker = '<script src="js/app.js" defer></script>';
      if(html.indexOf(marker)>=0){ html = html.replace(marker, bundle); }
    }
    return html;
  }
  async function downloadStandaloneHtml(filename, includeData){
    var snapEl=document.getElementById('lv_db_snapshot');
    var prev=snapEl? snapEl.textContent : null;
    if(snapEl){ snapEl.textContent = includeData ? JSON.stringify(db) : '{}'; }
    var html=document.documentElement.outerHTML;
    if(snapEl){ snapEl.textContent = prev; }
    var assets=await ensureInlineAssets();
    html = inlineStandaloneAssets(html, assets);
    var blob=new Blob([html],{type:'text/html;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=filename;
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  }

  document.getElementById('btnLocalSave').addEventListener('click', function(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); S('Data saved in this browser.'); }catch(e){ S('Browser save failed.'); } });
  document.getElementById('btnLocalLoad').addEventListener('click', function(){
    try{ var raw=localStorage.getItem(DB_KEY); if(raw){ db=JSON.parse(raw); normalizeDB(); renderAll(); S('Loaded data from local storage.'); } else { S('No local data found.'); } }catch(e){ S('Loading local data failed.'); }
  });
  document.getElementById('btnLocalReset').addEventListener('click', function(){
    if(!confirm('Delete all browser data for this app?')) return;
    try{ localStorage.removeItem(DB_KEY); }catch(_){ }
    syncFromServer();
    S('Local browser data removed.');
  });
  document.getElementById('btnSaveHtml').addEventListener('click', function(){ downloadStandaloneHtml('vis-lokaties.html', false); });
  document.getElementById('btnSaveHtmlWithData').addEventListener('click', function(){
    downloadStandaloneHtml('vis-lokaties-data.html', true).then(function(){ S('Standalone HTML with embedded data downloaded.'); }).catch(function(){ S('HTML export failed.'); });
  });

  document.getElementById('btnExport').addEventListener('click', function(){
    var blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='vis-lokaties-export.json';
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    S('JSON export downloaded.');
  });
  var fileMerge=document.getElementById('fileMerge');
  document.getElementById('btn-import-files2').addEventListener('click', function(){ try{ fileMerge.value=null; }catch(_){ } fileMerge.click(); });
  fileMerge.addEventListener('change', function(e){
    var file = (e.target.files||[])[0];
    if(!file){ S('No file selected.'); return; }
    file.text().then(function(text){
      var data=null;
      try{ data=JSON.parse(text); }catch(err){ S('Import failed: invalid JSON.'); return; }
      if(!data || typeof data!=='object'){ S('Import failed: unsupported structure.'); return; }
      if(Array.isArray(data.waters)) db.waters = db.waters.concat(data.waters);
      if(Array.isArray(data.steks))  db.steks  = db.steks.concat(data.steks);
      if(Array.isArray(data.rigs))   db.rigs   = db.rigs.concat(data.rigs);
      if(data.bathy && Array.isArray(data.bathy.points)){
        db.bathy = db.bathy || {points:[],datasets:[]};
        db.bathy.points = db.bathy.points.concat(data.bathy.points);
      }
      normalizeDB();
      saveDB();
      renderAll();
      S('Import completed. Newly added records were merged into the current project.');
    }).catch(function(){ S('Reading import file failed.'); });
  });

  var wxDate = document.getElementById('wxDate');
  var wxHour = document.getElementById('wxHour');
  var wxOut  = document.getElementById('wxOut');
  var wxDraw = document.getElementById('wxDrawArrows');
  var wxDensity = document.getElementById('wxDensity');
  var wxDensityLbl = document.getElementById('wxDensityLbl');
  wxDensity.addEventListener('input', function(){ wxDensityLbl.textContent = wxDensity.value; if(wxDraw.checked && lastWx) drawWind(lastWx.sel); });
  for(var h=0; h<24; h++){ var o=document.createElement('option'); o.value=String(h).padStart(2,'0'); o.textContent=String(h).padStart(2,'0')+':00'; wxHour.appendChild(o); }
  (function initWxDate(){ var d=new Date(); d.setHours(0,0,0,0); var iso=d.toISOString().slice(0,10); wxDate.value=iso; wxHour.value=String((new Date()).getHours()).padStart(2,'0'); })();

  var windLayer = L.layerGroup([], {pane:'labelsPane'}).addTo(map);
  var lastWx=null;
  function fmt(v,unit,dp){ return (v==null||!isFinite(v))?'—':(Number(v).toFixed(dp||0)+' '+unit); }
  function fetchWeatherFor(lat,lon,dayISO){
    var url = 'https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl&current_weather=true&timezone=auto&start_date='+dayISO+'&end_date='+dayISO;
    return fetch(url).then(function(r){return r.json();});
  }
  function selectWeatherHour(data, hour){
    var H = Number(hour)||0;
    var i = (data && data.hourly && Array.isArray(data.hourly.time)) ? data.hourly.time.findIndex(function(t){ return t.endsWith('T'+String(H).padStart(2,'0')+':00'); }) : -1;
    if(i<0) return null;
    return { t: data.hourly.temperature_2m[i], wspd: data.hourly.wind_speed_10m[i], wdir: data.hourly.wind_direction_10m[i], p: data.hourly.pressure_msl[i], time: data.hourly.time[i] };
  }
  function updateCompass(deg, wspd){
    if(!compCtrl) return;
    var a=document.getElementById('compArrow'); var info=document.getElementById('compInfo');
    if(a){ a.style.transform='rotate('+ (deg|0) +'deg)'; }
    if(info){ info.textContent = (deg!=null? (deg|0)+'°' : '—') + ' @ '+ fmt(wspd,'m/s',1); }
  }
  var compCtrl = L.control({position:'topright'});
  compCtrl.onAdd=function(){
    var div = L.DomUtil.create('div','leaflet-control windCompass');
    div.innerHTML = '<div style="text-align:center;font-weight:600">Wind</div><div id="compArrow"></div><div id="compInfo" class="mono" style="text-align:center;margin-top:4px">—</div>';
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  compCtrl.addTo(map);

  function drawWind(sel){
    windLayer.clearLayers();
    if(!wxDraw.checked || !sel) return;
    var b=map.getBounds();
    var dens = Number(wxDensity.value);
    var stepPx = {1:120,2:90,3:70,4:55,5:42,6:34}[dens] || 70;
    var pNW = map.latLngToContainerPoint(b.getNorthWest());
    var pNE = map.latLngToContainerPoint(L.latLng(b.getNorth(), b.getEast()));
    var pxPerDegX = (pNE.x - pNW.x) / (b.getEast() - b.getWest());
    var degStep = Math.max( (stepPx/Math.max(1,pxPerDegX)), 0.002 );
    var dir = (sel.wdir||0) * Math.PI/180;
    var lenMeters = 60 + (sel.wspd||0)*8;
    var dx = Math.sin(dir), dy = Math.cos(dir);
    for(var lat=b.getSouth(); lat<=b.getNorth(); lat+=degStep){
      for(var lon=b.getWest(); lon<=b.getEast(); lon+=degStep){
        var a = L.latLng(lat, lon);
        var m = lenMeters/111320;
        var bll = L.latLng(lat + (dx*m), lon + (dy*m)*Math.cos(lat*Math.PI/180));
        L.polyline([a,bll],{color:'#ffce3a',weight:2,opacity:0.9,pane:'labelsPane'}).addTo(windLayer);
        var head = 8/111320;
        var left=L.latLng(bll.lat + (-dy*head), bll.lng + (dx*head)*Math.cos(lat*Math.PI/180));
        var right=L.latLng(bll.lat + (dy*head),  bll.lng + (-dx*head)*Math.cos(lat*Math.PI/180));
        L.polyline([left,bll,right],{color:'#ffce3a',weight:2,opacity:0.9,pane:'labelsPane'}).addTo(windLayer);
      }
    }
  }

  document.getElementById('btnWeatherNow').addEventListener('click', function(){
    var c=map.getCenter();
    var dayISO = (new Date()).toISOString().slice(0,10);
    fetchWeatherFor(c.lat,c.lng,dayISO).then(function(d){
      var cur = (d && d.current_weather) ? d.current_weather : null;
      if(cur){
        wxOut.textContent = 'Now — T: '+fmt(cur.temperature,'°C',1)+', Wind: '+fmt(cur.windspeed,'m/s',1)+' @ '+fmt(cur.winddirection,'°',0)+', Pressure: '+fmt((d.hourly && d.hourly.pressure_msl? d.hourly.pressure_msl[0] : null),'hPa',0);
        updateCompass(cur.winddirection, cur.windspeed);
        lastWx = {data:d, sel:{t:cur.temperature,wspd:cur.windspeed,wdir:cur.winddirection,p:(d.hourly&&d.hourly.pressure_msl?d.hourly.pressure_msl[0]:null), time:new Date().toISOString()}};
        drawWind(lastWx.sel);
      }else{ wxOut.textContent='No live weather available.'; }
    }).catch(function(){ wxOut.textContent='Weather request failed.'; });
  });
  document.getElementById('btnWeatherLoad').addEventListener('click', function(){
    var c=map.getCenter();
    var dayISO = wxDate.value || (new Date()).toISOString().slice(0,10);
    var H = wxHour.value || '00';
    fetchWeatherFor(c.lat,c.lng,dayISO).then(function(d){
      var sel = selectWeatherHour(d, H);
      if(sel){
        wxOut.textContent = sel.time+' — T: '+fmt(sel.t,'°C',1)+', Wind: '+fmt(sel.wspd,'m/s',1)+' @ '+fmt(sel.wdir,'°',0)+', Pressure: '+fmt(sel.p,'hPa',0);
        updateCompass(sel.wdir, sel.wspd);
        lastWx={data:d,sel:sel};
        drawWind(sel);
      }else{ wxOut.textContent='Hour not found in weather dataset.'; }
    }).catch(function(){ wxOut.textContent='Weather request failed.'; });
  });

  function scoreSpot(lat, lon, swim){
    var pts=(db.bathy&&db.bathy.points)||[];
    var depth = interpIDW(lat,lon,pts,80,16);
    if(!isFinite(depth)) depth = 4;
    var depthScore = (depth>=2 && depth<=8) ? 4 : Math.max(-6, 4-Math.abs(depth-5));
    var grad = 0;
    var offsets=[5,12,18];
    offsets.forEach(function(off){
      var dLat = lat + off/111320;
      var dDepth = interpIDW(dLat,lon,pts,80,16);
      if(isFinite(dDepth)) grad += Math.abs(dDepth-depth)/off;
    });
    var d = distM({lat:lat,lon:lon},{lat:swim.lat,lon:swim.lng});
    var targetMin=20, targetMax=60;
    var distScore = (d<targetMin)? (d-targetMin) : (d>targetMax? (targetMax-d) : 2.0);
    var nearPenalty = 0;
    (db.rigs||[]).forEach(function(r){ var dd=distM({lat:lat,lon:lon},{lat:r.lat,lon:r.lng}); if(dd<12) nearPenalty -= (12-dd)*0.2; });
    return depthScore*1.8 + grad*2.2 + distScore*1.3 + nearPenalty;
  }
  document.getElementById('btnAutoRigs').addEventListener('click', function(){
    var b=map.getBounds();
    var added=0;
    (db.steks||[]).forEach(function(s){
      if(!b.contains([s.lat,s.lng])) return;
      var candidates=[];
      var radii=[22,36,52];
      var bearings=[0,45,90,135,180,225,270,315];
      radii.forEach(function(rm){
        var deg=rm/111320;
        bearings.forEach(function(br){
          var rad=br*Math.PI/180;
          var lat = s.lat + (Math.cos(rad)*deg);
          var lon = s.lng + (Math.sin(rad)*deg)*Math.cos(s.lat*Math.PI/180);
          var wid = nearestWaterIdForLatLng(lat, lon);
          if(s.waterId && wid && wid!==s.waterId) return;
          if(!b.contains([lat,lon])) return;
          var sc = scoreSpot(lat,lon,s);
          candidates.push({lat:lat,lng:lon,score:sc});
        });
      });
      if(!candidates.length) return;
      candidates.sort(function(a,b){return b.score-a.score;});
      var picked=[];
      for(var i=0;i<candidates.length && picked.length<2;i++){
        var ok=true;
        for(var j=0;j<picked.length;j++){
          if(distM({lat:candidates[i].lat,lon:candidates[i].lng},{lat:picked[j].lat,lon:picked[j].lng})<18){ ok=false; break; }
        }
        if(ok) picked.push(candidates[i]);
      }
      picked.forEach(function(p,k){
        db.rigs.push({id:uid('rig'),name:'Rig '+(k+1),lat:p.lat,lng:p.lng,stekId:s.id,waterId:s.waterId||nearestWaterIdForLatLng(p.lat,p.lng)||null});
        added++;
      });
    });
    if(added){ saveDB(); renderAll(); S('Auto-rigs placed: '+added+' new rig spots.'); } else { S('No candidates found. Zoom in or import more bathymetry.'); }
  });

  (function dedupeIds(){ const seen=new Set(); document.querySelectorAll('[id]').forEach(function(el){ if(!el.id) return; if(seen.has(el.id)) el.remove(); else seen.add(el.id); }); })();

  S('Ready.');
})(window);
