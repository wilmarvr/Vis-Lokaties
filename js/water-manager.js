(function(window){
  'use strict';

  var map = window.map;

  window.nearestWaterIdForLatLng = function(lat, lng, edgeMaxMeters){
    edgeMaxMeters = edgeMaxMeters || (parseFloat(document.getElementById('detMaxEdge').value)||250);
    if(!db.waters || !db.waters.length) return null;
    var pt = turf.point([lng, lat]);
    var best = {id:null, inside:false, dist:Infinity};
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
      if(better){ best.id = w.id; best.inside = inside; best.dist = d; }
    });
    if(best.id==null) return null;
    if(!best.inside && !(best.dist<=edgeMaxMeters)) return null;
    return best.id;
  };

  window.renderWaters = function(){
    var color=db.settings.waterColor||'#33a1ff';
    (db.waters||[]).forEach(function(w){
      var gj=L.geoJSON(w.geojson,{pane:'waterPane',interactive:true,style:function(){return {color:color,weight:2,fillOpacity:0.25};}});
      gj.eachLayer(function(layer){
        if(layer.feature && layer.feature.properties){
          layer.feature.properties.id = w.id;
          layer.feature.properties.kind = 'water';
          layer.feature.properties.name = w.name||'';
        }
        layer.on('click',function(){ selectWater(w.id); });
        window.waterGroup.addLayer(layer);
      });
    });
    window.waterGroup.addTo(map);
  };

  function selectWater(id){
    if(!window.waterGroup) return;
    window.waterGroup.eachLayer(function(l){
      if(l.setStyle){
        var propId=(l.feature&&l.feature.properties&&l.feature.properties.id);
        l.setStyle({weight:(propId===id)?4:2});
      }
    });
  }
  window.selectWater = selectWater;

  window.renameWater = function(id){
    var w=(db.waters||[]).find(function(x){return x.id===id;}); if(!w) return;
    var nv=prompt('New water name:', w.name||''); if(nv==null) return; w.name=String(nv).trim();
    if(w.geojson&&w.geojson.features){ w.geojson.features.forEach(function(f){if(!f.properties) f.properties={}; f.properties.name=w.name; f.properties.id=w.id; f.properties.kind='water';}); }
    saveDB(); renderAll(); S('Water renamed.');
  };

  // OSM detection helpers
  var OVERPASS='https://overpass-api.de/api/interpreter';
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
    function relationToMP(rel,wmap,nmap){var outerWays=[],innerWays=[];for(var i=0;i<rel.members.length;i++){var m=rel.members[i];if(m.type!=='way')continue;var w=wmap.get(m.ref);if(!w)continue;var coords=getCoordsOfWay(w,nmap);if(!coords)continue;(m.role==='inner'?innerWays:outerWays).push(coords);}var outers=stitchRings(outerWays),inners=stitchRings(innerWays);if(!outers.length)return null; var polys=outers.map(function(o){return[o];}); inners.forEach(function(inner){ var attached=false; for(var k=0;k<polys.length;k++){ try{ if(inner.length && inner[0]){ var inside = turf.booleanPointInPolygon(turf.point(inner[0]), {type:'Polygon',coordinates:polys[k]}); if(inside){ polys[k].push(inner); attached=true; break; } } }catch(_){} } if(!attached){ polys.push([inner]); } }); return polys.length===1?{type:'Polygon',coordinates:polys[0]}:{type:'MultiPolygon',coordinates:polys.map(function(p){return[p];})}; }
    function overpassToGeoJSON(data){var elements=data.elements||[],nmap=nodeMap(elements),wmap=wayMap(elements),features=[];
      for(var i=0;i<elements.length;i++){var el=elements[i];if(el.type==='way'){var way=wmap.get(el.id),coords=getCoordsOfWay(way,nmap);if(coords&&isClosed(coords)){features.push({type:'Feature',properties:{id:el.id,kind:'way',tags:el.tags||{}},geometry:{type:'Polygon',coordinates:[coords]}});}}}
      for(var j=0;j<elements.length;j++){var el2=elements[j];if(el2.type==='relation'&&el2.tags&&(el2.tags.type==='multipolygon'||el2.tags.type==='boundary')){var geom=relationToMP(el2,wmap,nmap);if(geom){features.push({type:'Feature',properties:{id:el2.id,kind:'relation',tags:el2.tags||{}},geometry:geom});}}}
      return{type:'FeatureCollection',features:features};}
    global.__overpassToGeoJSON=overpassToGeoJSON;
  })(window);

  document.getElementById('btnDetectOSM').addEventListener('click', function(){
    var b=map.getBounds();
    var bbox=[b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].join(',');
    var q='[out:json][timeout:25];(way["natural"="water"]('+bbox+'); relation["natural"="water"]('+bbox+');way["waterway"="riverbank"]('+bbox+'); relation["waterway"="riverbank"]('+bbox+');way["water"]('+bbox+'); relation["water"]('+bbox+'););out body; >; out skel qt;';
    S('Fetching OSM water…');
    fetch(OVERPASS,{method:'POST',body:q,headers:{'Content-Type':'text/plain;charset=UTF-8'}}).then(function(res){
      if(!res.ok){ S('OSM request failed: '+res.status); return null; }
      return res.json();
    }).then(function(data){
      if(!data) return;
      var gj=__overpassToGeoJSON(data);
      var bb=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
      var polys=[];
      (gj.features||[]).forEach(function(f){
        if(!f.geometry) return;
        if(f.geometry.type==='Polygon'||f.geometry.type==='MultiPolygon'){
          try{ var c=turf.bboxClip(f,bb); if(c && c.geometry && c.geometry.coordinates && c.geometry.coordinates.length){ polys.push(c); } }catch(_){}
        }
      });
      if(!polys.length){ S('No OSM water polygons within the viewport.'); I('0 polygons'); return; }
      var mergedList = mergeTouchingPolys(polys);
      var fc = {type:'FeatureCollection',features:mergedList};
      var selection = window.selectionState;
      if(selection.preview){ map.removeLayer(selection.preview); selection.preview=null; }
      selection.preview=L.geoJSON(fc,{pane:'waterPane',style:{color:'#00e5ff',weight:2,fillOpacity:0.25}}).addTo(map);
      var msg = (mergedList.length===1) ? '1 merged polygon (islands kept)' : (mergedList.length+' merged polygons');
      I(msg); S('OSM water ready. Click "Save as water".');
    }).catch(function(){ S('OSM: network error or rate limit.'); });
  });

  document.getElementById('btnSaveAsWater').addEventListener('click', function(){
    var selection = window.selectionState;
    var gj=null;
    if(selection.preview){ selection.preview.eachLayer(function(l){ try{ gj=l.toGeoJSON(); }catch(_){ } }); }
    else {
      var pts=pointsInViewport(800);
      gj=polygonFromPtsLngLat(pts);
    }
    if(!gj){ S('Nothing to save yet. Run one of the detection actions first.'); return; }
    var name=(document.getElementById('detName').value||( 'Water '+new Date().toISOString().slice(0,16).replace('T',' '))).trim();
    saveWaterFeature(gj,name);
    if(selection.preview){ map.removeLayer(selection.preview); selection.preview=null; }
    selection.points.clear(); selection.bestWater=null;
  });

  function saveWaterFeature(feat,name){
    var id=uid('water'); var f=JSON.parse(JSON.stringify(feat));
    if(!f.properties) f.properties={};
    f.properties.kind='water'; f.properties.name=name; f.properties.id=id;
    var fc={type:'FeatureCollection',features:[f]};
    db.waters.push({id:id,name:name,geojson:fc}); saveDB(); renderAll(); S('Water created: '+name);
  }

  function pointsInViewport(maxTake){
    var b=map.getBounds(), pts=[];
    (db.steks||[]).forEach(function(s){ if(b.contains([s.lat,s.lng])) pts.push([s.lng,s.lat]); });
    (db.rigs ||[]).forEach(function(r){ if(b.contains([r.lat,r.lng])) pts.push([r.lng,r.lat]); });
    var inView=((db.bathy&&db.bathy.points)||[]).filter(function(p){ return b.contains([p.lat,p.lon]); });
    var step=Math.max(1,Math.floor(inView.length/600));
    for(var i=0;i<inView.length;i+=step){ pts.push([inView[i].lon,inView[i].lat]); if(maxTake && pts.length>=maxTake) break; }
    return pts;
  }
  window.pointsInViewport = pointsInViewport;

  function polygonFromPtsLngLat(pts){
    if(pts.length<3) return null;
    var fc=turf.featureCollection(pts.map(function(c){return turf.point(c);}));
    var maxEdge=parseFloat(document.getElementById('detMaxEdge').value)||250;
    var poly=null;
    try{ poly=turf.concave(fc,{maxEdge:maxEdge,units:'meters'});}catch(_){}
    if(!poly){ try{ poly=turf.convex(fc);}catch(_){} }
    return poly;
  }
  window.polygonFromPtsLngLat = polygonFromPtsLngLat;

  document.getElementById('btnDetectViewport').addEventListener('click', function(){
    var pts=pointsInViewport(800);
    if(pts.length<3){ S('Not enough points within the viewport.'); return; }
    var poly=polygonFromPtsLngLat(pts);
    if(!poly){ S('Detection failed: unable to build a polygon.'); return; }
    var selection = window.selectionState;
    if(selection.preview){ map.removeLayer(selection.preview); }
    selection.preview=L.geoJSON(poly,{pane:'waterPane',style:{color:'#00e5ff',weight:2,fillOpacity:0.25}}).addTo(map);
    I('Preview ready from viewport — click "Save as water".');
  });

  document.getElementById('btnDetectFromPoints').addEventListener('click', function(){
    var selection = window.selectionState;
    var pts=Array.from(selection.points).map(function(k){ var p=k.split(','); return [parseFloat(p[1]),parseFloat(p[0])];});
    if(pts.length<3){ S('Select ≥3 points first (toggle selection mode on markers).'); return; }
    var poly=polygonFromPtsLngLat(pts);
    if(!poly){ S('Selection could not form a polygon.'); return; }
    if(selection.preview){ map.removeLayer(selection.preview); }
    selection.preview=L.geoJSON(poly,{pane:'waterPane',style:{color:'#00e5ff',weight:2,fillOpacity:0.25}}).addTo(map);
    I('Preview ready from manual selection — click "Save as water".');
  });
})(window);
