// ===== helpers / status =====
function S(m){var el=document.getElementById("statusLine"); if(el) el.textContent=String(m||'');}
function I(m){var el=document.getElementById("footerDetect"); if(el) el.textContent=String(m||''); var di=document.getElementById("detectInfo"); if(di) di.textContent=String(m||'');}
function esc(s){ return String(s).replace(/[&<>"']/g, function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m];}); }
function uid(p){ return p+"_"+Math.random().toString(36).slice(2,9); }
function distM(a,b){ var lat=(a.lat+b.lat)/2, kx=111320*Math.cos(lat*Math.PI/180), ky=110540; var dx=(a.lon-b.lon)*kx, dy=(a.lat-b.lat)*ky; return Math.sqrt(dx*dx+dy*dy); }
function nameOfWater(id){ var w=db.waters.find(function(x){return x.id===id;}); return w? (w.name||w.id) : null; }

// ===== kleur per stek =====
function colorForStekId(id){
  var h=0; for(var i=0;i<id.length;i++) h=(h*31 + id.charCodeAt(i))>>>0;
  h = h % 360;
  return { stroke:`hsl(${h} 85% 60%)`, fill:`hsl(${h} 85% 45%)` };
}
function coloredIcon(hexOrHsl, glyph){
  var fg = encodeURIComponent(hexOrHsl);
  var txt = glyph ? `<text x='12' y='15' font-size='12' text-anchor='middle' fill='white' font-family='sans-serif'>${glyph}</text>` : '';
  var svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
    <path d='M12 2c-3.3 0-6 2.7-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6z' fill='${fg}' stroke='rgba(0,0,0,.45)' stroke-width='1.2'/>
    ${txt}
  </svg>`;
  return L.icon({ iconUrl:'data:image/svg+xml;utf8,'+svg, iconSize:[24,24], iconAnchor:[12,24], tooltipAnchor:[0,-22] });
}

// ===== DB (zelfde key) + snapshot loader =====
var DB_KEY="lv_db_main"; // NIET wijzigen
var API_DB_URL='api/db.php';
var db={waters:[],steks:[],rigs:[],bathy:{points:[],datasets:[]},settings:{waterColor:"#33a1ff"}};
(function syncVersionLabel(){
  var versionMeta=document.querySelector('meta[name="app-version"]');
  var fallback=versionMeta?versionMeta.content:'';
  var el=document.getElementById('appVersion');
  if(el && fallback){ el.textContent=fallback; }
  try{
    fetch('version.json',{cache:'no-store'})
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if(!data || !data.version) return;
        if(el){ el.textContent=data.version; }
        document.title='Vis Lokaties '+data.version;
      })
      .catch(function(){});
  }catch(_){ }
})();
// 1) snapshot uit <script id="lv_db_snapshot"> (als niet leeg)
// 2) anders localStorage (fallback / handmatige import)
(function(){
  try{
    var snapEl=document.getElementById('lv_db_snapshot');
    if(snapEl && snapEl.textContent && snapEl.textContent.trim() && snapEl.textContent.trim()!=='{}'){
      db = JSON.parse(snapEl.textContent);
    }else{
      var raw=localStorage.getItem(DB_KEY); if(raw) db=JSON.parse(raw);
    }
  }catch(e){}
})();
normalizeDB();
syncFromServer();
var saveTimer=null;
function saveDB(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer=setTimeout(pushDbToServer, 400);
}
async function pushDbToServer(){
  try{
    await fetch(API_DB_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(db)});
    S('Serveropslag voltooid.');
  }catch(e){
    console.warn('Opslaan naar server mislukt',e);
    S('Opslaan naar server mislukt.');
  }
}
async function syncFromServer(){
  try{
    var res=await fetch(API_DB_URL,{cache:'no-store'});
    if(!res.ok) throw new Error('Bad status '+res.status);
    var remote=await res.json();
    if(remote && typeof remote==='object'){
      db=remote;
      normalizeDB();
      if(typeof window.renderAll==='function'){ window.renderAll(); }
      S('Gegevens geladen uit serverdatabase.');
    }
  }catch(e){
    console.warn('Serverdata laden mislukt, fallback naar snapshot/localStorage',e);
  }
}
function normalizeDB(){
  function num(v){ return (typeof v==='string'? parseFloat(v) : v); }
  db.steks=(db.steks||[]).map(function(s){return {id:s.id||uid('stek'),name:s.name||"",note:s.note||"",lat:num(s.lat),lng:num(s.lng),waterId:s.waterId||null};});
  db.rigs =(db.rigs ||[]).map(function(r){return {id:r.id||uid('rig'), name:r.name||"",note:r.note||"",lat:num(r.lat),lng:num(r.lng),stekId:r.stekId||null,waterId:r.waterId||null};});
  if(!db.waters) db.waters=[]; if(!db.bathy) db.bathy={points:[],datasets:[]};
  else { db.bathy.points=(db.bathy.points||[]).map(function(p){return {lat:num(p.lat),lon:num(p.lon),dep:num(p.dep)};}); }
}

// ===== kaart init (voorkomt dubbele init) =====
var map;
(function initMap(){
  var mapEl=document.getElementById('mapContainer');
  if(window.__VIS_MAP){ map=window.__VIS_MAP; } 
  else {
    map=L.map(mapEl,{zoomControl:true,preferCanvas:true});
    window.__VIS_MAP=map;
  }
  if(!map._loaded){ map.setView([52.4033055556,5.2391111111],17); }
})();
var bases={
  osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20}),
  toner:L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',{maxZoom:20}),
  terrain:L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',{maxZoom:18}),
  dark:L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:20})
};
bases.osm.addTo(map);
document.getElementById('basemap').addEventListener('change',function(e){
  Object.values(bases).forEach(function(t){ if(map.hasLayer(t)) map.removeLayer(t);});
  (bases[e.target.value]||bases.osm).addTo(map);
});
L.control.scale({position:"bottomright",imperial:false}).addTo(map);

// panes & groepen pas als map ready is
var waterGroup, isobandLayer, contourLayer, measureLayer, cluster;
map.whenReady(function(){
  ['waterPane','heatPane','isobandPane','contourPane','markerPane','labelsPane','measurePane'].forEach(function(p){
    if(!map.getPane(p)){ map.createPane(p); }
  });
  map.getPane('waterPane').style.zIndex=400;
  map.getPane('heatPane').style.zIndex=510;
  map.getPane('isobandPane').style.zIndex=520;
  map.getPane('contourPane').style.zIndex=530;
  map.getPane('markerPane').style.zIndex=800;  // markers boven labels
  map.getPane('labelsPane').style.zIndex=750;  // labels onder markers
  map.getPane('measurePane').style.zIndex=840;

  waterGroup=L.featureGroup([], {pane:'waterPane'}).addTo(map);
  isobandLayer=L.featureGroup([], {pane:'isobandPane'}).addTo(map);
  contourLayer=L.featureGroup([], {pane:'contourPane'}).addTo(map);
  measureLayer=L.layerGroup([], {pane:'measurePane'}).addTo(map);

  if (typeof window.renderAll === 'function') window.renderAll();
});

// ===== muispositie + zoom + diepte tooltip =====
var depthTip=document.getElementById('depthTip');
map.on('mousemove',function(e){
  var m=document.getElementById("mouseLL");
  if(m) m.textContent=e.latlng.lat.toFixed(6)+", "+e.latlng.lng.toFixed(6);
  var dep = interpIDW(e.latlng.lat, e.latlng.lng, (db.bathy && db.bathy.points)||[], 60, 12);
  var md=document.getElementById('mouseDepth');
  if(Number.isFinite(dep)){
    var txt="Diepte ≈ "+dep.toFixed(1)+" m";
    if(md) md.textContent=txt;
    depthTip.style.display='block';
    depthTip.textContent=txt;
  }else{
    if(md) md.textContent="Diepte: —";
    depthTip.style.display='none';
  }
});
map.on('mousemove', function(ev){
  depthTip.style.left = (ev.originalEvent.pageX+10)+'px';
  depthTip.style.top  = (ev.originalEvent.pageY-18)+'px';
});
map.on('mouseout', function(){ depthTip.style.display='none'; });
map.on('zoomend',function(){var z=document.getElementById("zoomLbl"); if(z) z.textContent="z"+map.getZoom();});

// ===== selectie / cluster / drag =====
var selection={points:new Set(),preview:null,bestWater:null};
function updateSelInfo(){var n=selection.points.size; var sug=selection.bestWater?(" • suggestie: "+(nameOfWater(selection.bestWater.id)||selection.bestWater.id)):""; I("Selectie: "+n+" punten"+sug+".");}
var selectMode=false;
var useCluster=false;
document.getElementById("useCluster").checked=false;
document.getElementById('useCluster').addEventListener('change',function(){useCluster=this.checked; renderAll();});
document.getElementById('btnForceDragFix').addEventListener('click',function(){useCluster=false; document.getElementById("useCluster").checked=false; renderAll(); S('Drag-fix toegepast (clustering uit).');});

// ===== markers / drag =====
var stekMarkers=new Map(), rigMarkers=new Map();
function purgeAllMarkers(){
  stekMarkers.forEach(function(m){try{if(useCluster && cluster){ cluster.removeLayer(m);} map.removeLayer(m);}catch(_){}}); 
  rigMarkers.forEach(function(m){try{if(useCluster && cluster){ cluster.removeLayer(m);} map.removeLayer(m);}catch(_){}}); 
  stekMarkers.clear(); rigMarkers.clear(); 
  try{if(cluster&&map.hasLayer(cluster)){cluster.clearLayers(); map.removeLayer(cluster);}}catch(_){} 
}

function attachMarker(m,type,id){
  // altijd drag activeren
  if(m.dragging && typeof m.dragging.enable === 'function') { m.dragging.enable(); }

  // kaart niet pannen tijdens slepen / down
  function stopAll(ev){ if(ev && ev.originalEvent){ ev.originalEvent.stopPropagation(); } }
  m.on('mousedown touchstart pointerdown', function(ev){ stopAll(ev); try{ map.dragging.disable(); }catch(_){} });
  m.on('mouseup touchend pointerup',     function(ev){ stopAll(ev); try{ map.dragging.enable();  }catch(_){} });

  m.on('dragstart',function(ev){
    stopAll(ev);
    try{ map.dragging.disable(); }catch(_){}
    if(useCluster && cluster){ try{ cluster.removeLayer(m);}catch(_){ } m.addTo(map); }
  });
  m.on('drag',function(){ drawDistances(); });
  m.on('dragend',function(ev){
    stopAll(ev);
    try{ map.dragging.enable(); }catch(_){}
    if(useCluster && cluster){ try{ map.removeLayer(m);}catch(_){ } cluster.addLayer(m); }
    var ll=ev.target.getLatLng();
    if(type==='stek'){
      var s=db.steks.find(function(x){return x.id===id;});
      if(s){ s.lat=ll.lat; s.lng=ll.lng; s.waterId = nearestWaterIdForLatLng(ll.lat,ll.lng) || s.waterId || null; }
    }
    if(type==='rig'){
      var r=db.rigs.find(function(x){return x.id===id;});
      if(r){ r.lat=ll.lat; r.lng=ll.lng; r.waterId = nearestWaterIdForLatLng(ll.lat,ll.lng) || r.waterId || null; }
    }
    saveDB(); renderAll(); S(type+' verplaatst & gekoppeld.');
  });

  // selectie (ongewijzigd)
  m.on('click',function(ev){
    if(!selectMode) return;
    ev.originalEvent.preventDefault();ev.originalEvent.stopPropagation();
    var ll=m.getLatLng(); var key=String(ll.lat.toFixed(7)+","+ll.lng.toFixed(7));
    var icon=ev.target._icon;
    if(selection.points.has(key)){ selection.points.delete(key); if(icon&&icon.classList) icon.classList.remove('sel'); }
    else { selection.points.add(key); if(icon&&icon.classList) icon.classList.add('sel'); }
    updateSelInfo();
  });
}
function makeStekMarker(s){
  var c = colorForStekId(s.id);
  var m=L.marker([s.lat,s.lng],{
    draggable:true, pane:'markerPane', autoPan:true, autoPanPadding:[60,60],
    riseOnHover:true, bubblingMouseEvents:false,
    icon: coloredIcon(c.fill, 'S')
  });
  attachMarker(m,'stek',s.id); m.bindTooltip((s.name||"Stek"),{direction:'top'}); stekMarkers.set(s.id,m); return m;
}
function makeRigMarker(r){
  var s=db.steks.find(function(x){return x.id===r.stekId;});
  var c = s ? colorForStekId(s.id) : {fill:'#888'};
  var m=L.marker([r.lat,r.lng],{
    draggable:true, pane:'markerPane', autoPan:true, autoPanPadding:[60,60],
    riseOnHover:true, bubblingMouseEvents:false,
    icon: coloredIcon(c.fill, 'R')
  });
  attachMarker(m,'rig',r.id); m.bindTooltip((r.name||"Rig")+(s? " • "+(s.name||s.id):""),{direction:'top'}); rigMarkers.set(r.id,m); return m;
}

// ===== water-koppeling =====
function nearestWaterIdForLatLng(lat, lng, edgeMaxMeters){
  edgeMaxMeters = edgeMaxMeters || (parseFloat(document.getElementById("detMaxEdge").value)||250);
  if(!db.waters || !db.waters.length) return null;
  var pt = turf.point([lng, lat]);
  var best = {id:null, inside:false, dist:Infinity, name:null};

  db.waters.forEach(function(w){
    var f = (w.geojson && w.geojson.features && w.geojson.features[0]) ? w.geojson.features[0] : null;
    if(!f) return;
    var inside=false;
    try{ inside = turf.booleanPointInPolygon(pt, f); }catch(_){ inside=false; }
    var d=Infinity;
    try{ var line = turf.polygonToLine(f); d = turf.pointToLineDistance(pt, line, {units:'meters'});}catch(_){}
    var better=false;
    if(inside && !best.inside) better=true;
    else if(inside && best.inside) better = d < best.dist - 1e-9;
    else if(!inside && !best.inside) better = d < best.dist - 1e-9;
    if(better){ best.id = w.id; best.inside = inside; best.dist = d; best.name = w.name||w.id; }
  });

  if(best.id==null) return null;
  if(!best.inside && !(best.dist<=edgeMaxMeters)) return null;
  return best.id;
}

// ===== picker =====
function pickFromList(title, items){
  var html = '<div style="position:fixed;inset:0;background:#0008;z-index:999999;display:flex;align-items:center;justify-content:center">' +
             '<div style="background:#0e151d;border:1px solid #233;border-radius:10px;padding:12px;min-width:320px">' +
             '<div style="font-weight:600;margin-bottom:8px">'+title+'</div>' +
             '<select id="__pickSel" style="width:100%;margin-bottom:10px">';
  items.forEach(function(it){ html+='<option value="'+esc(it.id)+'">'+esc(it.text)+'</option>'; });
  html+='</select><div style="text-align:right">' +
        '<button id="__pickOk">OK</button> <button id="__pickCancel">Annuleren</button>' +
        '</div></div></div>';
  var wrap=document.createElement('div'); wrap.innerHTML=html;
  document.body.appendChild(wrap);
  return new Promise(function(res){
    wrap.querySelector('#__pickOk').onclick=function(){ var v=wrap.querySelector('#__pickSel').value; wrap.remove(); res(v); };
    wrap.querySelector('#__pickCancel').onclick=function(){ wrap.remove(); res(null); };
  });
}

// ===== klikmodus: stek/rig plaatsen =====
var clickAddMode=null, badge=document.getElementById('clickModeBadge');
function setClickMode(mode){
  clickAddMode=mode;
  map.getContainer().style.cursor = mode? 'crosshair' : '';
  if(badge) badge.style.display = mode? 'inline-block' : 'none';
  S(mode? ('Klik op de kaart om een '+(mode==='stek'?'stek':'rig')+' te plaatsen… Esc annuleert.') : 'Klaar.');
}
document.addEventListener('keydown', function(e){ if(e.key==='Escape' && clickAddMode){ setClickMode(null); }});
document.getElementById('btn-add-stek').addEventListener('click', function(){ setClickMode('stek'); });
document.getElementById('btn-add-rig').addEventListener('click', function(){ setClickMode('rig'); });
map.on('click', function(ev){
  if(!clickAddMode) return;
  var wId = nearestWaterIdForLatLng(ev.latlng.lat, ev.latlng.lng);
  if(clickAddMode==='stek'){
    db.steks.push({id:uid('stek'),name:'Stek',lat:ev.latlng.lat,lng:ev.latlng.lng,waterId:wId||null});
    S('Stek geplaatst en '+(wId?'gekoppeld aan water.':'(nog) geen water gevonden.'));
  }else{
    db.rigs.push({id:uid('rig'),name:'Rig',lat:ev.latlng.lat,lng:ev.latlng.lng,stekId:null,waterId:wId||null});
    S('Rig geplaatst en '+(wId?'gekoppeld aan water.':'(nog) geen water gevonden.')+' Koppel optioneel aan stek in het overzicht.');
  }
  saveDB(); renderAll(); setClickMode(null);
});

// ===== muisdiepte (IDW) =====
function interpIDW(lat,lon,pts,R,K){
  R=R||60; K=K||12;
  var cand=[];
  for(var i=0;i<pts.length;i++){
    var p=pts[i];
    var d=distM({lat:lat,lon:lon},{lat:p.lat,lon:p.lon});
    if(d<=R) cand.push({d:d,p:p});
  }
  cand.sort(function(a,b){return a.d-b.d;});
  var take=cand.slice(0,Math.min(K,cand.length));
  if(!take.length) return NaN;
  var num=0,den=0;
  for(var j=0;j<take.length;j++){
    var it=take[j]; var w=1/Math.max(1e-6,it.d*it.d); num+=w*it.p.dep; den+=w;
  }
  return num/den;
}



// ====== OVERZICHT / RENDER ======
window.renderAll = function(){
  if(!map || !map._loaded) { map.whenReady(window.renderAll); return; }

  purgeAllMarkers();
  if(useCluster){ cluster=L.markerClusterGroup({disableClusteringAtZoom:19}); map.addLayer(cluster); }
  if(waterGroup){ waterGroup.clearLayers(); }
  if(isobandLayer){ isobandLayer.clearLayers(); }
  if(contourLayer){ contourLayer.clearLayers(); }
  if(measureLayer){ measureLayer.clearLayers(); }

  // waters
  (db.waters||[]).forEach(function(w){
    var color=db.settings.waterColor||"#33a1ff";
    var gj=L.geoJSON(w.geojson,{pane:'waterPane',interactive:true,style:function(){return {color:color,weight:2,fillOpacity:0.25};}});
    gj.eachLayer(function(layer){
      if(layer.feature && layer.feature.properties){
        layer.feature.properties.id = w.id;
        layer.feature.properties.kind = 'water';
        layer.feature.properties.name = w.name||'';
      }
      layer.on('click',function(){ selectWater(w.id); });
      waterGroup.addLayer(layer);
    });
  });
  waterGroup.addTo(map);

  // markers
  (db.steks||[]).forEach(function(s){ var m=makeStekMarker(s); if(useCluster) cluster.addLayer(m); else m.addTo(map); });
  (db.rigs ||[]).forEach(function(r){ var m=makeRigMarker(r); if(useCluster) cluster.addLayer(m); else m.addTo(map); });

  drawDistances();
  buildOverview();
};
function selectWater(id){
  if(!waterGroup) return;
  waterGroup.eachLayer(function(l){
    if(l.setStyle){
      var propId=(l.feature&&l.feature.properties&&l.feature.properties.id);
      l.setStyle({weight:(propId===id)?4:2});
    }
  });
}

// ====== CONNECT-LIJNEN + LABELS (gekleurde lijnen per stek) ======
window.drawDistances = function(){
  if(!measureLayer || !document.getElementById("showDistances").checked) { if(measureLayer) measureLayer.clearLayers(); return; }
  measureLayer.clearLayers();
  (db.steks||[]).forEach(function(s){
    var col = colorForStekId(s.id).stroke;
    (db.rigs||[]).filter(function(r){return r.stekId===s.id;}).forEach(function(r){
      var d=distM({lat:s.lat,lon:s.lng},{lat:r.lat,lon:r.lng});
      L.polyline([[s.lat,s.lng],[r.lat,r.lng]],{color:col,weight:3,opacity:0.9,pane:'measurePane',interactive:false}).addTo(measureLayer);
      var mid=L.latLng((s.lat+r.lat)/2,(s.lng+r.lng)/2);
      L.tooltip({permanent:true,direction:"center",className:"dist-label",pane:'labelsPane',interactive:false})
        .setContent(String(Math.round(d))+" m").setLatLng(mid).addTo(measureLayer);
    });
  });
};
document.getElementById("showDistances").addEventListener("change", drawDistances);

// ====== TABELLEN ======
function buildOverview(){
  document.querySelectorAll(".tab").forEach(function(btn){
    btn.onclick=function(){
      document.querySelectorAll(".tab").forEach(function(b){b.classList.remove("active");});
      btn.classList.add("active");
      document.getElementById("tab-waters").style.display=(btn.dataset.tab==="waters")?"block":"none";
      document.getElementById("tab-steks").style.display =(btn.dataset.tab==="steks") ?"block":"none";
      document.getElementById("tab-rigs").style.display  =(btn.dataset.tab==="rigs")  ?"block":"none";
    };
  });

  var tw=document.getElementById("tab-waters"); tw.innerHTML="";
  var wTable=document.createElement("table");
  wTable.innerHTML='<thead><tr><th>Naam</th><th>ID</th><th>Stekken</th><th>Rigspots</th><th colspan="2"></th></tr></thead><tbody></tbody>';
  var wBody=wTable.querySelector("tbody");
  (db.waters||[]).forEach(function(w){
    var steks=(db.steks||[]).filter(function(s){return s.waterId===w.id;});
    var rigs=0; steks.forEach(function(s){ rigs+=(db.rigs||[]).filter(function(r){return r.stekId===s.id;}).length; });
    var tr=document.createElement("tr");
    tr.innerHTML='<td>'+esc(w.name||"(onbenoemd)")+'</td><td>'+w.id+'</td><td>'+steks.length+'</td><td>'+rigs+'</td>'+
      '<td><button data-id="'+w.id+'" class="btn small btnRenWater">Hernoem</button></td>'+
      '<td><button data-id="'+w.id+'" class="btn small btnDelWater">Verwijder</button></td>';
    tr.onclick=function(ev){ if(ev.target.closest('button')) return; try{ var g=L.geoJSON(w.geojson); var B=g.getBounds(); if(B.isValid()) map.fitBounds(B.pad(0.08)); }catch(_){ } };
    wBody.appendChild(tr);
  });
  tw.appendChild(wTable);

  var ts=document.getElementById("tab-steks"); ts.innerHTML="";
  var sTable=document.createElement("table");
  sTable.innerHTML='<thead><tr><th>Naam</th><th>ID</th><th>Water</th><th>Rigspots</th><th colspan="3"></th></tr></thead><tbody></tbody>';
  var sBody=sTable.querySelector("tbody");
  (db.steks||[]).forEach(function(s){
    var rigs=(db.rigs||[]).filter(function(r){return r.stekId===s.id;}).length; var wName=nameOfWater(s.waterId)||"(geen)";
    var tr=document.createElement("tr");
    tr.innerHTML='<td>'+esc(s.name||"(stek)")+'</td><td>'+s.id+'</td><td>'+esc(wName)+'</td><td>'+rigs+'</td>'+
      '<td><button data-id="'+s.id+'" class="btn small btnRenStek">Hernoem</button></td>'+
      '<td><button data-id="'+s.id+'" class="btn small btnReWaterStek">Koppel water</button></td>'+
      '<td><button data-id="'+s.id+'" class="btn small btnDelStek danger">Verwijder</button></td>';
    tr.onclick=function(ev){ if(ev.target.closest('button')) return; map.setView([s.lat,s.lng], Math.max(map.getZoom(),17)); };
    sBody.appendChild(tr);
  });
  ts.appendChild(sTable);

  var trc=document.getElementById("tab-rigs"); trc.innerHTML="";
  var rTable=document.createElement("table");
  rTable.innerHTML='<thead><tr><th>Naam</th><th>ID</th><th>Stek</th><th>Water</th><th colspan="4"></th></tr></thead><tbody></tbody>';
  var rBody=rTable.querySelector("tbody");
  (db.rigs||[]).forEach(function(r){
    var s=(db.steks||[]).find(function(x){return x.id===r.stekId;});
    var tr=document.createElement("tr");
    tr.innerHTML='<td>'+esc(r.name||"(rig)")+'</td><td>'+r.id+'</td><td>'+esc(s?(s.name||s.id):"(geen)")+'</td><td>'+esc(nameOfWater(r.waterId)||"(auto)")+'</td>'+
      '<td><button data-id="'+r.id+'" class="btn small btnRenRig">Hernoem</button></td>'+
      '<td><button data-id="'+r.id+'" class="btn small btnReStekRig">Koppel stek</button></td>'+
      '<td><button data-id="'+r.id+'" class="btn small btnReWaterRig">Koppel water</button></td>'+
      '<td><button data-id="'+r.id+'" class="btn small btnDelRig danger">Verwijder</button></td>';
    tr.onclick=function(ev){ if(ev.target.closest('button')) return; map.setView([r.lat,r.lng], Math.max(map.getZoom(),18)); };
    rBody.appendChild(tr);
  });
  trc.appendChild(rTable);

  // events
  tw.querySelectorAll(".btnRenWater").forEach(function(b){ b.onclick=function(ev){ renameWater(ev.target.dataset.id); }; });
  tw.querySelectorAll(".btnDelWater").forEach(function(b){ b.onclick=function(ev){ var id=ev.target.dataset.id; if(!confirm("Water verwijderen?")) return;
    db.waters=db.waters.filter(function(x){return x.id!==id;}); (db.steks||[]).forEach(function(s){ if(s.waterId===id) s.waterId=null; }); (db.rigs||[]).forEach(function(r){ if(r.waterId===id) r.waterId=null; }); saveDB(); renderAll(); }; });

  ts.querySelectorAll(".btnRenStek").forEach(function(b){ b.onclick=function(ev){ renameStek(ev.target.dataset.id); }; });
  ts.querySelectorAll(".btnDelStek").forEach(function(b){ b.onclick=function(ev){ var id=ev.target.dataset.id; if(!confirm("Stek verwijderen?")) return; removeStek(id); }; });
  ts.querySelectorAll(".btnReWaterStek").forEach(function(b){
    b.onclick = async function(ev){
      var id = ev.target.dataset.id;
      var s = (db.steks||[]).find(function(x){return x.id===id;});
      if(!s){ return; }
      var pt=turf.point([s.lng,s.lat]);
      var arr=(db.waters||[]).map(function(w){
        var f=(w.geojson && w.geojson.features && w.geojson.features[0])?w.geojson.features[0]:null;
        var d=1e12,inside=false;
        if(f){
          try{inside=turf.booleanPointInPolygon(pt,f);}catch(_){}
          try{var line=turf.polygonToLine(f); d=turf.pointToLineDistance(pt,line,{units:'meters'});}catch(_){}
        }
        return {id:w.id, text:(w.name||w.id)+(inside?' (binnen)':'')+' • '+Math.round(d)+' m', d:d, inside:inside};
      }).sort(function(a,b){ return (a.inside===b.inside)?(a.d-b.d):(a.inside?-1:1); });
      var pick = await pickFromList('Koppel stek aan water', arr.slice(0,30));
      if(pick){ s.waterId=pick; saveDB(); renderAll(); S("Stek gekoppeld aan water."); }
    };
  });

  trc.querySelectorAll(".btnRenRig").forEach(function(b){ b.onclick=function(ev){ renameRig(ev.target.dataset.id); }; });
  trc.querySelectorAll(".btnDelRig").forEach(function(b){ b.onclick=function(ev){ var id=ev.target.dataset.id; if(!confirm("Rigspot verwijderen?")) return; removeRig(id); }; });
  trc.querySelectorAll(".btnReStekRig").forEach(function(b){
    b.onclick = async function(ev){
      var id = ev.target.dataset.id;
      var r = (db.rigs||[]).find(function(x){return x.id===id;});
      if(!r) return;
      var arr=(db.steks||[]).map(function(s){
        var d = distM({lat:r.lat,lon:r.lng},{lat:s.lat,lon:s.lng});
        return {id:s.id, text:(s.name||s.id)+' • '+Math.round(d)+' m', d:d};
      }).sort(function(a,b){ return a.d-b.d; });
      var pick = await pickFromList('Koppel rig aan stek', arr.slice(0,50));
      if(pick){ r.stekId=pick; saveDB(); renderAll(); S("Rig gekoppeld aan stek."); }
    };
  });
  trc.querySelectorAll(".btnReWaterRig").forEach(function(b){
    b.onclick = async function(ev){
      var id = ev.target.dataset.id;
      var r = (db.rigs||[]).find(function(x){return x.id===id;});
      if(!r) return;
      var pt=turf.point([r.lng,r.lat]);
      var arr=(db.waters||[]).map(function(w){
        var f=(w.geojson && w.geojson.features && w.geojson.features[0])?w.geojson.features[0]:null;
        var d=1e12,inside=false;
        if(f){
          try{inside=turf.booleanPointInPolygon(pt,f);}catch(_){}
          try{var line=turf.polygonToLine(f); d=turf.pointToLineDistance(pt,line,{units:'meters'});}catch(_){}
        }
        return {id:w.id, text:(w.name||w.id)+(inside?' (binnen)':'')+' • '+Math.round(d)+' m', d:d, inside:inside};
      }).sort(function(a,b){ return (a.inside===b.inside)?(a.d-b.d):(a.inside?-1:1); });
      var pick = await pickFromList('Koppel rig aan water', arr.slice(0,30));
      if(pick){ r.waterId=pick; saveDB(); renderAll(); S("Rig gekoppeld aan water."); }
    };
  });
}

// ====== rename/remove ======
function renameWater(id){ var w=(db.waters||[]).find(function(x){return x.id===id;}); if(!w) return; var nv=prompt("Nieuwe waternaam:", w.name||""); if(nv==null) return; w.name=String(nv).trim(); if(w.geojson&&w.geojson.features){ w.geojson.features.forEach(function(f){if(!f.properties) f.properties={}; f.properties.name=w.name; f.properties.id=w.id; f.properties.kind='water';}); } saveDB(); renderAll(); S("Water hernoemd."); }
function renameStek(id){ var s=(db.steks||[]).find(function(x){return x.id===id;}); if(!s) return; var nv=prompt("Nieuwe steknaam:", s.name||""); if(nv==null) return; s.name=String(nv).trim(); saveDB(); renderAll(); S("Stek hernoemd."); }
function renameRig(id){ var r=(db.rigs||[]).find(function(x){return x.id===id;}); if(!r) return; var nv=prompt("Nieuwe rigspotnaam:", r.name||""); if(nv==null) return; r.name=String(nv).trim(); saveDB(); renderAll(); }
function removeStek(id){ db.steks=(db.steks||[]).filter(function(s){return s.id!==id;}); (db.rigs||[]).forEach(function(r){ if(r.stekId===id) r.stekId=null; }); saveDB(); renderAll(); }
function removeRig(id){ db.rigs=(db.rigs||[]).filter(function(r){return r.id!==id;}); saveDB(); renderAll(); }

// ====== Detectie OSM ======
var OVERPASS="https://overpass-api.de/api/interpreter";
function featuresTouchOrOverlap(a,b){ try{ if(turf.booleanIntersects(a,b)) return true; var eps=0.00001; var ab=turf.buffer(a, eps, {units:'kilometers'}); return turf.booleanIntersects(ab,b); }catch(_){ return false; } }
function mergeTouchingPolys(features){
  var list = features.slice(), changed=true;
  while(changed && list.length>1){
    changed=false;
    outer: for(var i=0;i<list.length;i++){
      for(var j=i+1;j<list.length;j++){
        var A=list[i], B=list[j];
        var bbA=turf.bbox(A), bbB=turf.bbox(B);
        if(bbA[2]<bbB[0]||bbB[2]<bbA[0]||bbA[3]<bbB[1]||bbB[3]<bbA[1]) continue;
        if(featuresTouchOrOverlap(A,B)){
          var U=null; try{ U=turf.union(A,B); }catch(_){}
          if(U){ U.properties=Object.assign({},A.properties||{},B.properties||{}, {merged:true}); list.splice(j,1); list.splice(i,1,U); }
          changed=true; break outer;
        }
      }
    }
  }
  return list;
}
(function(global){
  function nodeMap(elements){var m=new Map();for(var i=0;i<elements.length;i++){var el=elements[i];if(el.type==='node')m.set(el.id,[el.lon,el.lat]);}return m;}
  function wayMap(elements){var m=new Map();for(var i=0;i<elements.length;i++){var el=elements[i];if(el.type==='way')m.set(el.id,{nodes:el.nodes||[],tags:el.tags||{}});}return m;}
  function getCoordsOfWay(way,nmap){var c=[];for(var i=0;i<way.nodes.length;i++){var nid=way.nodes[i];var p=nmap.get(nid);if(!p)return null;c.push(p);}return c;}
  function isClosed(c){if(!c||c.length<4)return false;var a=c[0],b=c[c.length-1];return a[0]===b[0]&&a[1]===b[1];}
  function stitchRings(list){var rings=[];var segs=list.map(function(a){return a.slice();});while(segs.length){var ring=segs.shift(),loop=true;while(loop){loop=false;for(var i=0;i<segs.length;i++){var s=segs[i],h=ring[0],t=ring[ring.length-1],sh=s[0],st=s[s.length-1];if(t[0]===sh[0]&&t[1]===sh[1]){ring=ring.concat(s.slice(1));segs.splice(i,1);loop=true;break;}if(t[0]===st[0]&&t[1]===st[1]){ring=ring.concat(s.slice(0,-1).reverse());segs.splice(i,1);loop=true;break;}if(h[0]===st[0]&&h[1]===st[1]){ring=s.concat(ring.slice(1));segs.splice(i,1);loop=true;break;}if(h[0]===sh[0]&&h[1]===sh[1]){ring=s.slice(0,-1).reverse().concat(ring);segs.splice(i,1);loop=true;break;}}}if(ring.length&&(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1]))ring.push(ring[0]);if(ring.length>=4)rings.push(ring);}return rings;}
  function relationToMP(rel,wmap,nmap){var outerWays=[],innerWays=[];for(var i=0;i<rel.members.length;i++){var m=rel.members[i];if(m.type!=='way')continue;var w=wmap.get(m.ref);if(!w)continue;var coords=getCoordsOfWay(w,nmap);if(!coords)continue;(m.role==='inner'?innerWays:outerWays).push(coords);}var outers=stitchRings(outerWays),inners=stitchRings(innerWays);if(!outers.length)return null;
    var polys=outers.map(function(o){return[o];});
    inners.forEach(function(inner){
      var attached=false;
      for(var k=0;k<polys.length;k++){
        // simpele bbox-in bbox-check is niet voldoende; gebruik turf.booleanPointInPolygon op één inner-vertex:
        try{
          if(inner.length && inner[0]){
            var inside = turf.booleanPointInPolygon(turf.point(inner[0]), {type:'Polygon',coordinates:polys[k]});
            if(inside){ polys[k].push(inner); attached=true; break; }
          }
        }catch(_){}
      }
      if(!attached){ polys.push([inner]); } // fallback
    });
    return polys.length===1?{type:'Polygon',coordinates:polys[0]}:{type:'MultiPolygon',coordinates:polys.map(function(p){return[p];})};
  }
  function overpassToGeoJSON(data){var elements=data.elements||[],nmap=nodeMap(elements),wmap=wayMap(elements),features=[];
    for(var i=0;i<elements.length;i++){var el=elements[i];if(el.type==='way'){var way=wmap.get(el.id),coords=getCoordsOfWay(way,nmap);if(coords&&isClosed(coords)){features.push({type:'Feature',properties:{id:el.id,kind:'way',tags:el.tags||{}},geometry:{type:'Polygon',coordinates:[coords]}});}}}
    for(var j=0;j<elements.length;j++){var el2=elements[j];if(el2.type==='relation'&&el2.tags&&(el2.tags.type==='multipolygon'||el2.tags.type==='boundary')){var geom=relationToMP(el2,wmap,nmap);if(geom){features.push({type:'Feature',properties:{id:el2.id,kind:'relation',tags:el2.tags||{}},geometry:geom});}}}
    return{type:'FeatureCollection',features:features};}
  window.__overpassToGeoJSON=overpassToGeoJSON;
})(window);

document.getElementById("btnDetectOSM").addEventListener('click', function(){
  var b=map.getBounds();
  var bbox=[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',');
  var q='[out:json][timeout:25];(way["natural"="water"]('+bbox+'); relation["natural"="water"]('+bbox+');way["waterway"="riverbank"]('+bbox+'); relation["waterway"="riverbank"]('+bbox+');way["water"]('+bbox+'); relation["water"]('+bbox+'););out body; >; out skel qt;';
  S("OSM: ophalen…");
  fetch(OVERPASS,{method:'POST',body:q,headers:{'Content-Type':'text/plain;charset=UTF-8'}}).then(function(res){
    if(!res.ok){ S("OSM: status "+res.status); return null; }
    return res.json();
  }).then(function(data){
    if(!data) return;
    var gj=__overpassToGeoJSON(data);
    var bb=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
    var polys=[];
    (gj.features||[]).forEach(function(f){
      if(!f.geometry) return;
      if(f.geometry.type==="Polygon"||f.geometry.type==="MultiPolygon"){
        try{ var c=turf.bboxClip(f,bb); if(c && c.geometry && c.geometry.coordinates && c.geometry.coordinates.length){ polys.push(c); } }catch(_){}
      }
    });
    if(!polys.length){ S("Geen OSM-water in beeld."); I("0 polygonen"); return; }

    var mergedList = mergeTouchingPolys(polys);
    var fc = {type:'FeatureCollection',features:mergedList};
    if(selection.preview){ map.removeLayer(selection.preview); selection.preview=null; }
    selection.preview=L.geoJSON(fc,{pane:'waterPane',style:{color:'#00e5ff',weight:2,fillOpacity:0.25}}).addTo(map);

    var msg = (mergedList.length===1) ? "1 samengevoegd waterpoly (eilanden behouden)" : (mergedList.length+" water-polys (samengevoegd waar mogelijk)");
    I(msg); S("OSM-water gedetecteerd. Klik ‘Opslaan’ om als water op te slaan.");
  }).catch(function(){ S("OSM: netwerkfout / rate-limit."); });
});

// Opslaan naar water
document.getElementById("btnSaveAsWater").addEventListener('click', function(){
  var gj=null;
  if(selection.preview){ selection.preview.eachLayer(function(l){ try{ gj=l.toGeoJSON(); }catch(_){ } }); }
  else {
    var pts=pointsInViewport(800);
    gj=polygonFromPtsLngLat(pts);
  }
  if(!gj){ S("Geen poly om op te slaan. Gebruik detectie-knoppen."); return; }
  var name=(document.getElementById("detName").value||("Water "+new Date().toISOString().slice(0,16).replace('T',' '))).trim();
  saveWaterFeature(gj,name);
  if(selection.preview){ map.removeLayer(selection.preview); selection.preview=null; }
  selection.points.clear(); selection.bestWater=null; 
});
function saveWaterFeature(feat,name){
  var id=uid("water"); var f=JSON.parse(JSON.stringify(feat));
  if(!f.properties) f.properties={};
  f.properties.kind='water'; f.properties.name=name; f.properties.id=id;
  var fc={type:'FeatureCollection',features:[f]};
  db.waters.push({id:id,name:name,geojson:fc}); saveDB(); renderAll(); S("Water aangemaakt: "+name);
}

// ====== Heatmap / Deeper import ======
var hmRadius = document.getElementById("hmRadius"),
    hmBlur   = document.getElementById("hmBlur"),
    hmMin    = document.getElementById("hmMin"),
    hmMax    = document.getElementById("hmMax"),
    hmInvert = document.getElementById("hmInvert"),
    hmClip   = document.getElementById("hmClip"),
    hmFixed  = document.getElementById("hmFixed");
document.getElementById("hmR").textContent = hmRadius.value;
document.getElementById("hmB").textContent = hmBlur.value;
hmRadius.addEventListener("input", function(){ document.getElementById("hmR").textContent = hmRadius.value; if(window.heatLayer) applyHeatFromRaw(); });
hmBlur  .addEventListener("input", function(){ document.getElementById("hmB").textContent = hmBlur.value; if(window.heatLayer) applyHeatFromRaw(); });
[hmMin, hmMax, hmInvert, hmClip].forEach(function(el){ el.addEventListener("change", applyHeatFromRaw); });
hmFixed.addEventListener("change", function(){ if(hmFixed.checked){ hmMin.value=0; hmMax.value=20; hmMin.disabled=true; hmMax.disabled=true; } else { hmMin.disabled=false; hmMax.disabled=false; } applyHeatFromRaw(); });

var fImpBar=document.getElementById("impBarAll"), fImpPct=document.getElementById("impPctAll"), fImpCount=document.getElementById("impCount");
function setOverall(done,total){ var pct=Math.round((done/Math.max(1,total))*100); if(fImpCount) fImpCount.textContent=done+"/"+total; if(fImpPct) fImpPct.textContent=pct+"%"; if(fImpBar) fImpBar.style.width=pct+"%"; }

var heatLayer=null, rawAll=(db.bathy && Array.isArray(db.bathy.points))? db.bathy.points.slice() : [], currentPoints=[];
function setBathyTotal(n){ var el=document.getElementById("bathyTotal"); if(el) el.textContent=String(n||0); }
function setHeatCount(n){ var el=document.getElementById("heatCount"); if(el) el.textContent=String(n||0); }

var autoMin=0, autoMax=0;
function updateLegend(min,max,inv){ var st=document.getElementById("hmStats"); if(st) st.textContent = "Min: " + (min==null?"auto":min) + " m • Max: " + (max==null?"auto":max) + " m"; var lg=document.getElementById("legend"); if(lg){ lg.classList.toggle('inv', !!inv); } }
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

// Import UI
var btnFiles = document.getElementById("btn-import-files"),
    btnDir   = document.getElementById("btn-import-dir"),
    fileInp  = document.getElementById("fileDeeper"),
    dirInp   = document.getElementById("dirDeeper");
btnFiles.addEventListener("click", function(){ try{ fileInp.value=null; }catch(_){} fileInp.click(); });
btnDir  .addEventListener("click", function(){ try{ dirInp.value=null; }catch(_){} dirInp.click(); });
fileInp.addEventListener("change", function(e){ handleFiles([].slice.call(e.target.files||[])); });
dirInp .addEventListener("change", function(e){ handleFiles([].slice.call(e.target.files||[])); });

var queueDiv=document.getElementById("queue"); function setQueue(names){ if(queueDiv) queueDiv.textContent = names.join("\n"); }

// CSV parse + ZIP handling
function parseCSV(text, seen){
  var lines = text.replace(/\r\n?/g,"\n").split("\n").filter(function(x){return x.trim().length>0;});
  if(lines.length<1) return {points:[], raw:[]};
  var first = lines[0];
  var semi = (first.split(";").length-1) > (first.split(",").length-1);
  var delim = semi ? ";" : ",";
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
        var k=lat.toFixed(6)+","+lon.toFixed(6)+","+dep.toFixed(2);
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
  if(!files.length){ S("Geen bestanden."); return; }
  S("Voorbereiden: ZIPs uitpakken en CSVs verzamelen…");
  var saveToDB = !!document.getElementById("saveBathy").checked;
  var rawAccumulator=[], seen=new Set(), live=[], tasks=[], q=[], done=0, total=0, pendingZips=0;

  for(var i=0;i<files.length;i++){
    (function(f){
      var name=(f.webkitRelativePath||f.name||"onbekend");
      if(/\.csv$/i.test(name)){
        tasks.push({label:name, fetchText:function(){ return f.text(); }});
      }else if(/\.zip$/i.test(name)){
        pendingZips++;
        JSZip.loadAsync(f).then(function(zip){
          Object.keys(zip.files).forEach(function(k){
            var zf=zip.files[k];
            if(zf.dir) return;
            if(/\.csv$/i.test(k)){
              tasks.push({label:name+"::"+k, fetchText:function(){ return zf.async("text"); }});
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
    if(!total){ S("Geen CSVs gevonden."); return; }
    S("Importeren gestart… ("+total+" CSVs)");

    (function nextTask(idx){
      if(idx>=tasks.length){
        setOverall(total,total);
        if(saveToDB && rawAccumulator.length){
          if(!db.bathy) db.bathy={points:[],datasets:[]};
          var seenDB=new Set();
          for(var i=0;i<(db.bathy.points||[]).length;i++){
            var p=db.bathy.points[i];
            seenDB.add(p.lat.toFixed(6)+","+p.lon.toFixed(6)+","+p.dep.toFixed(2));
          }
          var added=0;
          for(var j=0;j<rawAccumulator.length;j++){
            var qpt=rawAccumulator[j];
            var key=qpt.lat.toFixed(6)+","+qpt.lon.toFixed(6)+","+qpt.dep.toFixed(2);
            if(!seenDB.has(key)){ seenDB.add(key); db.bathy.points.push(qpt); added++; }
          }
          db.bathy.datasets.push({id:"ds_"+Math.random().toString(36).slice(2,9), ts:Date.now(), files: total, added: added});
          saveDB();
          rawAll = (db.bathy.points||[]).slice();
          setBathyTotal((db.bathy.points||[]).length);
          applyHeatFromRaw();
          S("Import klaar. DB +"+added+" punt(en).");
        }else{
          if(live.length){ buildHeat(live); S("Heatmap: "+live.length+" punt(en)."); }
          else { S("Geen punten gevonden."); }
        }
        return;
      }

      var t=tasks[idx];
      t.fetchText().then(function(txt){
        var res = parseCSV(txt, seen);
        if(res.points && res.points.length){
          live = live.concat(res.points);
          buildHeat(live);
        }
        if(res.raw && res.raw.length){
          rawAccumulator = rawAccumulator.concat(res.raw);
          setBathyTotal((db.bathy.points?db.bathy.points.length:0) + rawAccumulator.length);
        }
        done++;
        q = q.filter(function(n){return n!==t.label;});
        setQueue(q); setOverall(done, Math.max(1,total));
        nextTask(idx+1);
      }).catch(function(){
        done++;
        q = q.filter(function(n){return n!==t.label;});
        setQueue(q); setOverall(done, Math.max(1,total));
        nextTask(idx+1);
      });
    })(0);
  }
}

// Wis knoppen
document.getElementById("btn-clear-heat").addEventListener("click", function(){
  if(heatLayer){ map.removeLayer(heatLayer); heatLayer=null; currentPoints=[]; setHeatCount(0); S("Heatmap gewist."); }
});
document.getElementById("btn-clear-bathy").addEventListener("click", function(){
  if(!confirm("Alle bathymetrie (DB) wissen?")) return;
  db.bathy.points=[]; db.bathy.datasets=[];
  saveDB();
  rawAll=[]; if(heatLayer){ map.removeLayer(heatLayer); heatLayer=null; }
  currentPoints=[]; setBathyTotal(0); setHeatCount(0);
  S("Bathymetrie uit DB gewist.");
});

// Auto-update bij kaartbeweging indien clip aan
map.on("moveend", function(){ if(document.getElementById("hmClip").checked){ applyHeatFromRaw(); } });

// Init heatmap indien DB data
map.whenReady(function(){
  setBathyTotal((db.bathy && Array.isArray(db.bathy.points)) ? db.bathy.points.length : 0);
  if(db.bathy && Array.isArray(db.bathy.points) && db.bathy.points.length){
    rawAll = db.bathy.points.slice();
    applyHeatFromRaw();
  }
});

// ====== Detectie eigen punten ======
function pointsInViewport(maxTake){
  var b=map.getBounds(), pts=[];
  (db.steks||[]).forEach(function(s){ if(b.contains([s.lat,s.lng])) pts.push([s.lng,s.lat]); });
  (db.rigs ||[]).forEach(function(r){ if(b.contains([r.lat,r.lng])) pts.push([r.lng,r.lat]); });
  var inView=((db.bathy&&db.bathy.points)||[]).filter(function(p){ return b.contains([p.lat,p.lon]); });
  var step=Math.max(1,Math.floor(inView.length/600));
  for(var i=0;i<inView.length;i+=step){ pts.push([inView[i].lon,inView[i].lat]); if(maxTake && pts.length>=maxTake) break; }
  return pts;
}
function polygonFromPtsLngLat(pts){
  if(pts.length<3) return null;
  var fc=turf.featureCollection(pts.map(function(c){return turf.point(c);}));
  var maxEdge=parseFloat(document.getElementById("detMaxEdge").value)||250;
  var poly=null;
  try{ poly=turf.concave(fc,{maxEdge:maxEdge,units:'meters'});}catch(_){}
  if(!poly){ try{ poly=turf.convex(fc);}catch(_){} }
  return poly;
}
document.getElementById("btnDetectViewport").addEventListener("click", function(){
  var pts=pointsInViewport(800);
  if(pts.length<3){ S("Te weinig punten in beeld."); return; }
  var poly=polygonFromPtsLngLat(pts);
  if(!poly){ S("Detectie mislukte: geen poly."); return; }
  if(selection.preview){ map.removeLayer(selection.preview); }
  selection.preview=L.geoJSON(poly,{pane:'waterPane',style:{color:'#00e5ff',weight:2,fillOpacity:0.25}}).addTo(map);
  I("Voorbeeld (viewport) klaar — klik ‘Opslaan’.");
});
document.getElementById("btnDetectFromPoints").addEventListener("click", function(){
  var pts=Array.from(selection.points).map(function(k){ var p=k.split(','); return [parseFloat(p[1]),parseFloat(p[0])];});
  if(pts.length<3){ S("Selecteer eerst ≥3 punten."); return; }
  var poly=polygonFromPtsLngLat(pts);
  if(!poly){ S("Selectie → geen poly."); return; }
  if(selection.preview){ map.removeLayer(selection.preview); }
  selection.preview=L.geoJSON(poly,{pane:'waterPane',style:{color:'#00e5ff',weight:2,fillOpacity:0.25}}).addTo(map);
  I("Voorbeeld (selectie) klaar — klik ‘Opslaan’.");
});

// ====== Contouren ======
function generateContours(){
  var pts=(db.bathy&&db.bathy.points)||[]; if(pts.length<5){ S("Te weinig dieptepunten voor contouren."); return; }
  var b=map.getBounds();
  var bb=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
  var min=Infinity,max=-Infinity; pts.forEach(function(p){ if(isFinite(p.dep)){ if(p.dep<min)min=p.dep; if(p.dep>max)max=p.dep; } });
  if(!isFinite(min)||!isFinite(max)||max===min){ S("Geen spreiding in diepte."); return; }
  var step=0.5, vmin=min, vmax=max;
  try{
    var uMin=parseFloat(document.getElementById("hmMin").value), uMax=parseFloat(document.getElementById("hmMax").value);
    if(document.getElementById("hmFixed").checked){ vmin=0; vmax=20; }
    else { if(!isNaN(uMin)) vmin=uMin; if(!isNaN(uMax)) vmax=uMax; }
  }catch(_){}
  var levels=[]; for(var v=vmin; v<=vmax+1e-9; v+=step) levels.push(parseFloat(v.toFixed(3)));

  var degPerM=1/111320; var cellM=14; var cellDeg=cellM*degPerM;
  var grid=[]; for(var y=bb[1]; y<=bb[3]; y+=cellDeg){ var row=[]; for(var x=bb[0]; x<=bb[2]; x+=cellDeg){ row.push(interpIDW(y,x, pts, 60, 12)); } grid.push(row); }
  var fcs=[]; var yy=bb[1];
  for(var i=0;i<grid.length;i++){ var xx=bb[0]; for(var j=0;j<grid[i].length;j++){ var val=grid[i][j]; if(isFinite(val)) fcs.push(turf.point([xx,yy],{value:val})); xx+=cellDeg; } yy+=cellDeg; }
  var ptsFC=turf.featureCollection(fcs);
  var lines=null; try{ lines=turf.isolines(ptsFC, levels, {zProperty:'value'});}catch(e){ console.error(e); S("Fout bij isolines."); return; }

  contourLayer.clearLayers(); isobandLayer.clearLayers();
  L.geoJSON(lines,{style:{color:'#44f1c6',weight:1.5,opacity:0.9},pane:'contourPane'}).addTo(contourLayer);
  S("Contouren klaar: "+(lines.features||[]).length+" lijnen.");
}
document.getElementById('btn-gen-contours').addEventListener('click', generateContours);
document.getElementById('btn-clear-contours').addEventListener('click', function(){ contourLayer.clearLayers(); isobandLayer.clearLayers(); S("Contouren gewist."); });

// ====== GPS ======
var gpsWatchId = null;
function startGPS(){
  if (!navigator.geolocation) { S("GPS niet beschikbaar."); return; }
  if (gpsWatchId != null) return;
  var opts = { enableHighAccuracy:true, maximumAge:2000, timeout:10000 };
  gpsWatchId = navigator.geolocation.watchPosition(function(p){
    var c = p.coords || {};
    document.getElementById('gpsLat').textContent = (p.coords.latitude||0).toFixed(6);
    document.getElementById('gpsLon').textContent = (p.coords.longitude||0).toFixed(6);
    document.getElementById('gpsAcc').textContent = Math.round(c.accuracy||0);
    document.getElementById('gpsSpd').textContent = Math.round((c.speed||0)*10)/10;
    document.getElementById('gpsBrg').textContent = Math.round(c.heading||0);
    document.getElementById('gpsStatus').textContent = 'aan';
  }, function(){ stopGPS(); S("GPS: geen fix."); }, opts);
}
function stopGPS(){ if (gpsWatchId != null) { try{ navigator.geolocation.clearWatch(gpsWatchId); }catch(_){} gpsWatchId = null; } document.getElementById('gpsStatus').textContent = 'uit'; }
document.getElementById('btnGps').addEventListener('click', function(){ if(gpsWatchId==null) startGPS(); else stopGPS(); });

var inlineAssetsPromise=null;
function ensureInlineAssets(){
  if(!inlineAssetsPromise){
    inlineAssetsPromise=Promise.all([
      fetch('css/styles.css').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';}),
      fetch('js/app.js').then(function(r){return r.ok?r.text():'';}).catch(function(){return'';})
    ]).then(function(res){ return {css:res[0]||'', js:res[1]||''}; });
  }
  return inlineAssetsPromise;
}
function inlineStandaloneAssets(html, assets){
  if(assets.css){ html=html.replace('<link rel="stylesheet" href="css/styles.css">','<style>'+assets.css+'</style>'); }
  if(assets.js){
    ['<script src="js/app.js" defer=""></script>','<script src="js/app.js" defer></script>','<script src="js/app.js"></script>'].forEach(function(tag){
      if(html.indexOf(tag)>=0){ html=html.replace(tag,'<script>'+assets.js+'</script>'); }
    });
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

// ====== Local save/export ======
document.getElementById('btnLocalSave').addEventListener('click', function(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); S('Data opgeslagen in browser.'); }catch(e){ S('Opslaan in browser mislukt.'); } });
document.getElementById('btnLocalLoad').addEventListener('click', function(){
  try{ var raw=localStorage.getItem(DB_KEY); if(raw){ db=JSON.parse(raw); normalizeDB(); renderAll(); S('Data geladen uit browser.'); } else { S('Geen data gevonden in browser.'); } }catch(e){ S('Laden mislukt.'); }
});
document.getElementById('btnLocalReset').addEventListener('click', function(){
  if(!confirm('Alle lokale data wissen?')) return;
  try{ localStorage.removeItem(DB_KEY); }catch(_){}
  syncFromServer();
  S('Lokale browser data gewist.');
});
document.getElementById('btnSaveHtml').addEventListener('click', function(){ downloadStandaloneHtml('Vis Lokaties v1.1.4-d.html', false); });
// 🔥 Download inclusief data-snapshot
document.getElementById('btnSaveHtmlWithData').addEventListener('click', function(){
  downloadStandaloneHtml('Vis Lokaties v1.1.4-d (met data).html', true).then(function(){ S('HTML met data gedownload.'); }).catch(function(){ S('Download mislukt.'); });
});

// ====== Weer integratie + wind overlay ======
var wxDate = document.getElementById('wxDate');
var wxHour = document.getElementById('wxHour');
var wxOut  = document.getElementById('wxOut');
var wxDraw = document.getElementById('wxDrawArrows');
var wxDensity = document.getElementById('wxDensity');
var wxDensityLbl = document.getElementById('wxDensityLbl');
wxDensity.addEventListener('input', function(){ wxDensityLbl.textContent = wxDensity.value; if(wxDraw.checked && lastWx) drawWind(lastWx.sel); });
for(var h=0; h<24; h++){ var o=document.createElement('option'); o.value=String(h).padStart(2,'0'); o.textContent=String(h).padStart(2,'0')+":00"; wxHour.appendChild(o); }
(function initWxDate(){ var d=new Date(); d.setHours(0,0,0,0); var iso=d.toISOString().slice(0,10); wxDate.value=iso; wxHour.value=String((new Date()).getHours()).padStart(2,'0'); })();

var windLayer = L.layerGroup([], {pane:'labelsPane'}).addTo(map);
var lastWx=null;

function fmt(v,unit,dp){ return (v==null||!isFinite(v))?'—':(Number(v).toFixed(dp||0)+' '+unit); }
function fetchWeatherFor(lat,lon,dayISO){
  var url = "https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl&current_weather=true&timezone=auto&start_date="+dayISO+"&end_date="+dayISO;
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

// Kompas
var compCtrl = L.control({position:'topright'});
compCtrl.onAdd=function(){
  var div = L.DomUtil.create('div','leaflet-control windCompass');
  div.innerHTML = '<div style="text-align:center;font-weight:600">Wind</div><div id="compArrow"></div><div id="compInfo" class="mono" style="text-align:center;margin-top:4px">—</div>';
  L.DomEvent.disableClickPropagation(div);
  return div;
};
compCtrl.addTo(map);

// pijlen tekenen
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
      wxOut.textContent = 'Nu — T: '+fmt(cur.temperature,'°C',1)+', Wind: '+fmt(cur.windspeed,'m/s',1)+' @ '+fmt(cur.winddirection,'°',0)+', Druk: '+fmt((d.hourly && d.hourly.pressure_msl? d.hourly.pressure_msl[0] : null),'hPa',0);
      updateCompass(cur.winddirection, cur.windspeed);
      lastWx = {data:d, sel:{t:cur.temperature,wspd:cur.windspeed,wdir:cur.winddirection,p:(d.hourly&&d.hourly.pressure_msl?d.hourly.pressure_msl[0]:null), time:new Date().toISOString()}};
      drawWind(lastWx.sel);
    }else{ wxOut.textContent='Geen huidige weersdata.'; }
  }).catch(function(){ wxOut.textContent='Weer ophalen mislukt.'; });
});
document.getElementById('btnWeatherLoad').addEventListener('click', function(){
  var c=map.getCenter();
  var dayISO = wxDate.value || (new Date()).toISOString().slice(0,10);
  var H = wxHour.value || '00';
  fetchWeatherFor(c.lat,c.lng,dayISO).then(function(d){
    var sel = selectWeatherHour(d, H);
    if(sel){
      wxOut.textContent = sel.time+' — T: '+fmt(sel.t,'°C',1)+', Wind: '+fmt(sel.wspd,'m/s',1)+' @ '+fmt(sel.wdir,'°',0)+', Druk: '+fmt(sel.p,'hPa',0);
      updateCompass(sel.wdir, sel.wspd);
      lastWx = {data:d, sel:sel};
      drawWind(sel);
    }else{ wxOut.textContent='Geen uurdata.'; }
  }).catch(function(){ wxOut.textContent='Weer ophalen mislukt.'; });
});
wxDraw.addEventListener('change', function(){ if(lastWx) drawWind(lastWx.sel); });
map.on('moveend zoomend', function(){ if(wxDraw.checked && lastWx){ drawWind(lastWx.sel); } });

// ====== Auto-rigs (2 per zichtbare stek) ======
function scoreSpot(lat, lon, sekitar){
  var dep = interpIDW(lat,lon, (db.bathy&&db.bathy.points)||[], 70, 16);
  if(!isFinite(dep)) return -1e9;
  var depthPrefMin=2, depthPrefMax=6;
  var depthScore = (dep<depthPrefMin)? (dep-depthPrefMin) : (dep>depthPrefMax? (depthPrefMax-dep) : 2.5);

  var eps=0.00025;
  var depE = interpIDW(lat, lon+eps*Math.cos(lat*Math.PI/180), (db.bathy&&db.bathy.points)||[], 70, 16);
  var depN = interpIDW(lat+eps, lon, (db.bathy&&db.bathy.points)||[], 70, 16);
  var grad = 0;
  if(isFinite(depE)&&isFinite(depN)) grad = Math.abs(depE-dep)+Math.abs(depN-dep);

  var d = distM({lat:lat,lon:lon},{lat:sekitar.lat,lon:sekitar.lng});
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
  if(added){ saveDB(); renderAll(); S('Auto-rigs: '+added+' rigspots toegevoegd.'); } else { S('Geen kandidaten gevonden. Zoom in / importeer meer bathy.'); }
});

// ====== eenmalig UI dedupe ======
(function(){
  const seen=new Set();
  document.querySelectorAll('[id]').forEach(function(el){ if(!el.id) return; if(seen.has(el.id)) el.remove(); else seen.add(el.id); });
})();

S('Klaar.');
