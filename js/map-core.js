(function(window){
  'use strict';

  var mapEl = document.getElementById('mapContainer');
  var map = window.map = (window.__VIS_MAP) ? window.__VIS_MAP : L.map(mapEl,{zoomControl:true,preferCanvas:true});
  window.__VIS_MAP = map;
  if(!map._loaded){ map.setView([52.4033055556,5.2391111111],17); }

  var bases = {
    osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20}),
    toner:L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',{maxZoom:20}),
    terrain:L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',{maxZoom:18}),
    dark:L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:20})
  };
  bases.osm.addTo(map);
  document.getElementById('basemap').addEventListener('change',function(e){
    Object.values(bases).forEach(function(t){ if(map.hasLayer(t)) map.removeLayer(t); });
    (bases[e.target.value] || bases.osm).addTo(map);
  });
  L.control.scale({position:'bottomright',imperial:false}).addTo(map);

  var panes = ['waterPane','heatPane','isobandPane','contourPane','markerPane','labelsPane','measurePane'];
  map.whenReady(function(){
    panes.forEach(function(name){ if(!map.getPane(name)){ map.createPane(name); } });
    map.getPane('waterPane').style.zIndex=400;
    map.getPane('heatPane').style.zIndex=510;
    map.getPane('isobandPane').style.zIndex=520;
    map.getPane('contourPane').style.zIndex=530;
    map.getPane('markerPane').style.zIndex=800;
    map.getPane('labelsPane').style.zIndex=750;
    map.getPane('measurePane').style.zIndex=840;
    if(typeof window.renderAll === 'function'){ window.renderAll(); }
  });

  window.waterGroup = L.featureGroup([], {pane:'waterPane'}).addTo(map);
  window.isobandLayer = L.featureGroup([], {pane:'isobandPane'}).addTo(map);
  window.contourLayer = L.featureGroup([], {pane:'contourPane'}).addTo(map);
  window.measureLayer = L.layerGroup([], {pane:'measurePane'}).addTo(map);
  window.cluster = null;

  var depthTip=document.getElementById('depthTip');
  map.on('mousemove',function(e){
    var ll = document.getElementById('mouseLL');
    if(ll) ll.textContent = e.latlng.lat.toFixed(6)+', '+e.latlng.lng.toFixed(6);
    var dep = interpIDW(e.latlng.lat, e.latlng.lng, (window.db && window.db.bathy && window.db.bathy.points)||[], 60, 12);
    var md=document.getElementById('mouseDepth');
    if(Number.isFinite(dep)){
      var txt='Depth ≈ '+dep.toFixed(1)+' m';
      if(md) md.textContent=txt;
      depthTip.style.display='block';
      depthTip.textContent=txt;
    }else{
      if(md) md.textContent='Depth: —';
      depthTip.style.display='none';
    }
  });
  map.on('mousemove',function(ev){
    depthTip.style.left = (ev.originalEvent.pageX+10)+'px';
    depthTip.style.top  = (ev.originalEvent.pageY-18)+'px';
  });
  map.on('mouseout', function(){ depthTip.style.display='none'; });
  map.on('zoomend',function(){ var z=document.getElementById('zoomLbl'); if(z) z.textContent='z'+map.getZoom(); });
})(window);
