(function(window){
  'use strict';

  var map = window.map;
  var selection = {points:new Set(),preview:null,bestWater:null};

  function rerender(){
    if(typeof window.renderAll === 'function'){ window.renderAll(); }
  }

  function updateSelInfo(){
    var n = selection.points.size;
    var suggestion = selection.bestWater ? (' • suggestion: ' + (nameOfWater(selection.bestWater.id) || selection.bestWater.id)) : '';
    I('Selection: ' + n + ' points' + suggestion + '.');
  }
  function clearSelectionForMarker(marker){
    if(!selection.points.size) return;
    var ll = marker.getLatLng();
    var key = ll.lat.toFixed(7) + ',' + ll.lng.toFixed(7);
    if(selection.points.delete(key)){
      if(marker._icon && marker._icon.classList){ marker._icon.classList.remove('sel'); }
      updateSelInfo();
    }
  }

  var selectMode=false;
  var useCluster=false;
  var cluster=null;
  document.getElementById('useCluster').checked=false;
  document.getElementById('useCluster').addEventListener('change',function(){
    useCluster=this.checked;
    rerender();
  });
  document.getElementById('btnForceDragFix').addEventListener('click',function(){
    useCluster=false;
    document.getElementById('useCluster').checked=false;
    rerender();
    S('Drag fix applied (clustering disabled).');
  });

  var stekMarkers=new Map();
  var rigMarkers=new Map();
  function purgeAllMarkers(){
    stekMarkers.forEach(function(m){ try{ if(useCluster && cluster){ cluster.removeLayer(m); } map.removeLayer(m); }catch(_){ } });
    rigMarkers.forEach(function(m){ try{ if(useCluster && cluster){ cluster.removeLayer(m); } map.removeLayer(m); }catch(_){ } });
    stekMarkers.clear();
    rigMarkers.clear();
    if(cluster){ try{ cluster.clearLayers(); map.removeLayer(cluster); }catch(_){ } cluster=null; window.cluster=null; }
  }

  function attachMarker(m,type,id){
    if(m.dragging && typeof m.dragging.enable === 'function'){ m.dragging.enable(); }
    function stopAll(ev){ if(ev && ev.originalEvent){ ev.originalEvent.stopPropagation(); ev.originalEvent.preventDefault(); } }
    m.on('mousedown touchstart pointerdown', function(ev){ stopAll(ev); try{ map.dragging.disable(); }catch(_){ } });
    m.on('mouseup touchend pointerup', function(ev){ stopAll(ev); try{ map.dragging.enable(); }catch(_){ } });
    m.on('dragstart',function(ev){
      stopAll(ev);
      try{ map.dragging.disable(); }catch(_){ }
      clearSelectionForMarker(m);
      if(m._icon && m._icon.classList){ m._icon.classList.remove('sel'); }
      if(useCluster && cluster){ try{ cluster.removeLayer(m);}catch(_){ } m.addTo(map); }
    });
    m.on('drag',function(){ window.drawDistances(); });
    m.on('dragend',function(ev){
      stopAll(ev);
      try{ map.dragging.enable(); }catch(_){ }
      if(useCluster && cluster){ try{ map.removeLayer(m);}catch(_){ } cluster.addLayer(m); }
      var ll=ev.target.getLatLng();
      if(type==='stek'){
        var s=db.steks.find(function(x){return x.id===id;});
        if(s){
          s.lat=ll.lat; s.lng=ll.lng;
          s.waterId = nearestWaterIdForLatLng(ll.lat,ll.lng) || s.waterId || null;
        }
      }
      if(type==='rig'){
        var r=db.rigs.find(function(x){return x.id===id;});
        if(r){
          r.lat=ll.lat; r.lng=ll.lng;
          r.waterId = nearestWaterIdForLatLng(ll.lat,ll.lng) || r.waterId || null;
        }
      }
      saveDB();
      rerender();
      S(type==='stek' ? 'Swim moved.' : 'Rig moved.');
    });
    m.on('click',function(ev){
      if(!selectMode) return;
      ev.originalEvent.preventDefault();
      ev.originalEvent.stopPropagation();
      var ll=m.getLatLng();
      var key=String(ll.lat.toFixed(7)+','+ll.lng.toFixed(7));
      var icon=ev.target._icon;
      if(selection.points.has(key)){ selection.points.delete(key); if(icon&&icon.classList) icon.classList.remove('sel'); }
      else { selection.points.add(key); if(icon&&icon.classList) icon.classList.add('sel'); }
      updateSelInfo();
    });
  }

  function makeStekMarker(s){
    var m=L.marker([s.lat,s.lng],{
      draggable:true,
      pane:'markerPane',
      autoPan:true,
      autoPanPadding:[60,60],
      riseOnHover:true,
      bubblingMouseEvents:false
    });
    attachMarker(m,'stek',s.id);
    m.bindTooltip((s.name||'Swim'),{direction:'top'});
    stekMarkers.set(s.id,m);
    return m;
  }
  function makeRigMarker(r){
    var s=db.steks.find(function(x){return x.id===r.stekId;});
    var m=L.marker([r.lat,r.lng],{
      draggable:true,
      pane:'markerPane',
      autoPan:true,
      autoPanPadding:[60,60],
      riseOnHover:true,
      bubblingMouseEvents:false
    });
    attachMarker(m,'rig',r.id);
    m.bindTooltip((r.name||'Rig')+(s? ' • '+(s.name||s.id):''),{direction:'top'});
    rigMarkers.set(r.id,m);
    return m;
  }

  var clickAddMode=null;
  var badge=document.getElementById('clickModeBadge');
  function setClickMode(mode){
    clickAddMode=mode;
    map.getContainer().style.cursor = mode? 'crosshair' : '';
    if(badge){ badge.style.display = mode ? 'inline-block' : 'none'; }
    if(!mode){ S('Ready.'); return; }
    if(mode==='stek'){ S('Click the map to add a swim. Press Esc to cancel.'); }
    if(mode==='rig'){ S('Click the map to add a rig. Press Esc to cancel.'); }
  }
  window.setClickMode = setClickMode;
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && clickAddMode){ setClickMode(null); }});
  document.getElementById('btn-add-stek').addEventListener('click', function(){ setClickMode('stek'); });
  document.getElementById('btn-add-rig').addEventListener('click', function(){ setClickMode('rig'); });
  map.on('click', function(ev){
    if(!clickAddMode) return;
    var wId = nearestWaterIdForLatLng(ev.latlng.lat, ev.latlng.lng);
    if(clickAddMode==='stek'){
      db.steks.push({id:uid('stek'),name:'Swim',lat:ev.latlng.lat,lng:ev.latlng.lng,waterId:wId||null});
      S('Swim added '+(wId?'and linked to water.':'(no water found yet).'));
    }else{
      db.rigs.push({id:uid('rig'),name:'Rig',lat:ev.latlng.lat,lng:ev.latlng.lng,stekId:null,waterId:wId||null});
      S('Rig added '+(wId?'and linked to water.':'(no water found). Link it later via the overview.'));
    }
    saveDB();
    rerender();
    setClickMode(null);
  });

  window.renderAll = function(){
    if(!map || !map._loaded) { map.whenReady(window.renderAll); return; }
    purgeAllMarkers();
    if(useCluster){ cluster = L.markerClusterGroup({disableClusteringAtZoom:19}); map.addLayer(cluster); window.cluster = cluster; }
    else { window.cluster = null; }
    if(window.waterGroup){ window.waterGroup.clearLayers(); }
    if(window.isobandLayer){ window.isobandLayer.clearLayers(); }
    if(window.contourLayer){ window.contourLayer.clearLayers(); }
    if(window.measureLayer){ window.measureLayer.clearLayers(); }
    if(typeof window.refreshHeatFromState === 'function'){ window.refreshHeatFromState(); }
    if(typeof window.renderWaters === 'function'){ window.renderWaters(); }
    (db.steks||[]).forEach(function(s){ var m=makeStekMarker(s); if(useCluster && cluster) cluster.addLayer(m); else m.addTo(map); });
    (db.rigs||[]).forEach(function(r){ var m=makeRigMarker(r); if(useCluster && cluster) cluster.addLayer(m); else m.addTo(map); });
    window.drawDistances();
    buildOverview();
    if(typeof window.renderDatasets === 'function'){ window.renderDatasets(); }
  };

  window.drawDistances = function(){
    if(!window.measureLayer || !document.getElementById('showDistances').checked) { if(window.measureLayer) window.measureLayer.clearLayers(); return; }
    window.measureLayer.clearLayers();
    (db.steks||[]).forEach(function(s){
      (db.rigs||[]).filter(function(r){return r.stekId===s.id;}).forEach(function(r){
        var d=distM({lat:s.lat,lon:s.lng},{lat:r.lat,lon:r.lng});
        L.polyline([[s.lat,s.lng],[r.lat,r.lng]],{color:'#7bf1a8',weight:3,opacity:0.8,pane:'measurePane',interactive:false}).addTo(window.measureLayer);
        var mid=L.latLng((s.lat+r.lat)/2,(s.lng+r.lng)/2);
        L.tooltip({permanent:true,direction:'center',className:'dist-label',pane:'labelsPane',interactive:false})
          .setContent(String(Math.round(d))+' m').setLatLng(mid).addTo(window.measureLayer);
      });
    });
  };
  document.getElementById('showDistances').addEventListener('change', window.drawDistances);

  function buildOverview(){
    document.querySelectorAll('.tab').forEach(function(btn){
      btn.onclick=function(){
        document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        document.getElementById('tab-waters').style.display=(btn.dataset.tab==='waters')?'block':'none';
        document.getElementById('tab-steks').style.display =(btn.dataset.tab==='steks') ?'block':'none';
        document.getElementById('tab-rigs').style.display  =(btn.dataset.tab==='rigs')  ?'block':'none';
      };
    });

    var tw=document.getElementById('tab-waters'); tw.innerHTML='';
    var wTable=document.createElement('table');
    wTable.innerHTML='<thead><tr><th>Name</th><th>ID</th><th>Swims</th><th>Rigs</th><th colspan="2"></th></tr></thead><tbody></tbody>';
    var wBody=wTable.querySelector('tbody');
    (db.waters||[]).forEach(function(w){
      var steks=(db.steks||[]).filter(function(s){return s.waterId===w.id;});
      var rigs=0; steks.forEach(function(s){ rigs+=(db.rigs||[]).filter(function(r){return r.stekId===s.id;}).length; });
      var tr=document.createElement('tr');
      tr.innerHTML='<td>'+esc(w.name||'(unnamed)')+'</td><td>'+w.id+'</td><td>'+steks.length+'</td><td>'+rigs+'</td>'+
        '<td><button data-id="'+w.id+'" class="btn small btnRenWater">Rename</button></td>'+
        '<td><button data-id="'+w.id+'" class="btn small btnDelWater">Delete</button></td>';
      tr.onclick=function(ev){ if(ev.target.closest('button')) return; try{ var g=L.geoJSON(w.geojson); var B=g.getBounds(); if(B.isValid()) map.fitBounds(B.pad(0.08)); }catch(_){ } };
      wBody.appendChild(tr);
    });
    tw.appendChild(wTable);

    var ts=document.getElementById('tab-steks'); ts.innerHTML='';
    var sTable=document.createElement('table');
    sTable.innerHTML='<thead><tr><th>Name</th><th>ID</th><th>Water</th><th>Rigs</th><th colspan="3"></th></tr></thead><tbody></tbody>';
    var sBody=sTable.querySelector('tbody');
    (db.steks||[]).forEach(function(s){
      var rigs=(db.rigs||[]).filter(function(r){return r.stekId===s.id;}).length; var wName=nameOfWater(s.waterId)||'(none)';
      var tr=document.createElement('tr');
      tr.innerHTML='<td>'+esc(s.name||'(swim)')+'</td><td>'+s.id+'</td><td>'+esc(wName)+'</td><td>'+rigs+'</td>'+
        '<td><button data-id="'+s.id+'" class="btn small btnRenStek">Rename</button></td>'+
        '<td><button data-id="'+s.id+'" class="btn small btnReWaterStek">Link water</button></td>'+
        '<td><button data-id="'+s.id+'" class="btn small btnDelStek danger">Delete</button></td>';
      tr.onclick=function(ev){ if(ev.target.closest('button')) return; map.setView([s.lat,s.lng], Math.max(map.getZoom(),17)); };
      sBody.appendChild(tr);
    });
    ts.appendChild(sTable);

    var trc=document.getElementById('tab-rigs'); trc.innerHTML='';
    var rTable=document.createElement('table');
    rTable.innerHTML='<thead><tr><th>Name</th><th>ID</th><th>Swim</th><th>Water</th><th colspan="4"></th></tr></thead><tbody></tbody>';
    var rBody=rTable.querySelector('tbody');
    (db.rigs||[]).forEach(function(r){
      var s=(db.steks||[]).find(function(x){return x.id===r.stekId;});
      var tr=document.createElement('tr');
      tr.innerHTML='<td>'+esc(r.name||'(rig)')+'</td><td>'+r.id+'</td><td>'+esc(s?(s.name||s.id):'(none)')+'</td><td>'+esc(nameOfWater(r.waterId)||'(auto)')+'</td>'+
        '<td><button data-id="'+r.id+'" class="btn small btnRenRig">Rename</button></td>'+
        '<td><button data-id="'+r.id+'" class="btn small btnReStekRig">Link swim</button></td>'+
        '<td><button data-id="'+r.id+'" class="btn small btnReWaterRig">Link water</button></td>'+
        '<td><button data-id="'+r.id+'" class="btn small btnDelRig danger">Delete</button></td>';
      tr.onclick=function(ev){ if(ev.target.closest('button')) return; map.setView([r.lat,r.lng], Math.max(map.getZoom(),18)); };
      rBody.appendChild(tr);
    });
    trc.appendChild(rTable);

    tw.querySelectorAll('.btnRenWater').forEach(function(b){ b.onclick=function(ev){ renameWater(ev.target.dataset.id); }; });
    tw.querySelectorAll('.btnDelWater').forEach(function(b){ b.onclick=function(ev){ var id=ev.target.dataset.id; if(!confirm('Delete this water body?')) return;
      db.waters=db.waters.filter(function(x){return x.id!==id;}); (db.steks||[]).forEach(function(s){ if(s.waterId===id) s.waterId=null; }); (db.rigs||[]).forEach(function(r){ if(r.waterId===id) r.waterId=null; }); saveDB(); rerender(); };
    });

    ts.querySelectorAll('.btnRenStek').forEach(function(b){ b.onclick=function(ev){ renameStek(ev.target.dataset.id); }; });
    ts.querySelectorAll('.btnDelStek').forEach(function(b){ b.onclick=function(ev){ var id=ev.target.dataset.id; if(!confirm('Delete this swim?')) return; removeStek(id); }; });
    ts.querySelectorAll('.btnReWaterStek').forEach(function(b){
      b.onclick = async function(ev){
        var id = ev.target.dataset.id;
        var s = (db.steks||[]).find(function(x){return x.id===id;});
        if(!s){ return; }
        var pt=turf.point([s.lng,s.lat]);
        var arr=(db.waters||[]).map(function(w){
          var f=(w.geojson && w.geojson.features && w.geojson.features[0])?w.geojson.features[0]:null;
          var d=1e12,inside=false;
          if(f){
            try{inside=turf.booleanPointInPolygon(pt,f);}catch(_){ }
            try{var line=turf.polygonToLine(f); d=turf.pointToLineDistance(pt,line,{units:'meters'});}catch(_){ }
          }
          return {id:w.id, text:(w.name||w.id)+(inside?' (inside)':'')+' • '+Math.round(d)+' m', d:d, inside:inside};
        }).sort(function(a,b){ return (a.inside===b.inside)?(a.d-b.d):(a.inside?-1:1); });
        var pick = await pickFromList('Link swim to water', arr.slice(0,30));
        if(pick){ s.waterId=pick; saveDB(); rerender(); S('Swim linked to water.'); }
      };
    });

    rTable.querySelectorAll('.btnRenRig').forEach(function(b){ b.onclick=function(ev){ renameRig(ev.target.dataset.id); }; });
    rTable.querySelectorAll('.btnDelRig').forEach(function(b){ b.onclick=function(ev){ var id=ev.target.dataset.id; if(!confirm('Delete this rig?')) return; removeRig(id); }; });
    rTable.querySelectorAll('.btnReStekRig').forEach(function(b){
      b.onclick = async function(ev){
        var id = ev.target.dataset.id;
        var r = (db.rigs||[]).find(function(x){return x.id===id;});
        if(!r) return;
        var arr=(db.steks||[]).map(function(s){
          var d = distM({lat:r.lat,lon:r.lng},{lat:s.lat,lon:s.lng});
          return {id:s.id, text:(s.name||s.id)+' • '+Math.round(d)+' m', d:d};
        }).sort(function(a,b){ return a.d-b.d; });
        var pick = await pickFromList('Link rig to swim', arr.slice(0,50));
        if(pick){ r.stekId=pick; saveDB(); rerender(); S('Rig linked to swim.'); }
      };
    });
    rTable.querySelectorAll('.btnReWaterRig').forEach(function(b){
      b.onclick = async function(ev){
        var id = ev.target.dataset.id;
        var r = (db.rigs||[]).find(function(x){return x.id===id;});
        if(!r) return;
        var pt=turf.point([r.lng,r.lat]);
        var arr=(db.waters||[]).map(function(w){
          var f=(w.geojson && w.geojson.features && w.geojson.features[0])?w.geojson.features[0]:null;
          var d=1e12,inside=false;
          if(f){
            try{inside=turf.booleanPointInPolygon(pt,f);}catch(_){ }
            try{var line=turf.polygonToLine(f); d=turf.pointToLineDistance(pt,line,{units:'meters'});}catch(_){ }
          }
          return {id:w.id, text:(w.name||w.id)+(inside?' (inside)':'')+' • '+Math.round(d)+' m', d:d, inside:inside};
        }).sort(function(a,b){ return (a.inside===b.inside)?(a.d-b.d):(a.inside?-1:1); });
        var pick = await pickFromList('Link rig to water', arr.slice(0,30));
        if(pick){ r.waterId=pick; saveDB(); rerender(); S('Rig linked to water.'); }
      };
    });
  }

  function renameStek(id){ var s=(db.steks||[]).find(function(x){return x.id===id;}); if(!s) return; var nv=prompt('New swim name:', s.name||''); if(nv==null) return; s.name=String(nv).trim(); saveDB(); rerender(); S('Swim renamed.'); }
  function renameRig(id){ var r=(db.rigs||[]).find(function(x){return x.id===id;}); if(!r) return; var nv=prompt('New rig name:', r.name||''); if(nv==null) return; r.name=String(nv).trim(); saveDB(); rerender(); }
  function removeStek(id){ db.steks=(db.steks||[]).filter(function(s){return s.id!==id;}); (db.rigs||[]).forEach(function(r){ if(r.stekId===id) r.stekId=null; }); saveDB(); rerender(); }
  function removeRig(id){ db.rigs=(db.rigs||[]).filter(function(r){return r.id!==id;}); saveDB(); rerender(); }

  window.selectionState = selection;
  updateSelInfo();
  rerender();
})(window);
