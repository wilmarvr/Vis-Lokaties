(function(window){
  'use strict';
  window.S = function statusMessage(message){
    var el = document.getElementById('statusLine');
    if(el){ el.textContent = String(message || ''); }
  };

  window.I = function infoMessage(message){
    var footer = document.getElementById('footerDetect');
    if(footer){ footer.textContent = String(message || ''); }
    var detect = document.getElementById('detectInfo');
    if(detect){ detect.textContent = String(message || ''); }
  };

  window.esc = function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, function(m){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m];
    });
  };

  window.uid = function uid(prefix){
    return prefix + '_' + Math.random().toString(36).slice(2, 9);
  };

  window.distM = function distanceMeters(a, b){
    var lat = (a.lat + b.lat) / 2;
    var kx = 111320 * Math.cos(lat * Math.PI / 180);
    var ky = 110540;
    var dx = (a.lon - b.lon) * kx;
    var dy = (a.lat - b.lat) * ky;
    return Math.sqrt(dx * dx + dy * dy);
  };

  window.nameOfWater = function nameOfWater(id){
    if(!window.db || !Array.isArray(window.db.waters)) return null;
    var w = window.db.waters.find(function(x){ return x.id === id; });
    return w ? (w.name || w.id) : null;
  };

  window.colorForStekId = function colorForStekId(id){
    var h = 0;
    for(var i=0;i<id.length;i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    h = h % 360;
    return { stroke:'hsl(' + h + ' 85% 60%)', fill:'hsl(' + h + ' 85% 45%)' };
  };

  window.coloredIcon = function coloredIcon(color, glyph){
    var txt = glyph ? "<text x='12' y='15' font-size='12' text-anchor='middle' fill='white' font-family='sans-serif'>" + glyph + "</text>" : '';
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
              "<path d='M12 2c-3.3 0-6 2.7-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6z' fill='" + color + "' stroke='rgba(0,0,0,.45)' stroke-width='1.2'/>" +
              txt + '</svg>';
    return L.icon({ iconUrl:'data:image/svg+xml;utf8,' + encodeURIComponent(svg), iconSize:[24,24], iconAnchor:[12,24], tooltipAnchor:[0,-22] });
  };

  window.pickFromList = function pickFromList(title, items){
    var html = '<div class="modal-overlay">' +
               '<div class="modal">' +
               '<div class="modal-title">' + title + '</div>' +
               '<select id="__pickSel" class="modal-select">';
    items.forEach(function(it){ html += '<option value="' + esc(it.id) + '">' + esc(it.text) + '</option>'; });
    html += '</select><div class="modal-actions">' +
            '<button id="__pickOk">OK</button> <button id="__pickCancel">Cancel</button>' +
            '</div></div></div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    return new Promise(function(resolve){
      wrap.querySelector('#__pickOk').onclick = function(){
        var v = wrap.querySelector('#__pickSel').value;
        wrap.remove();
        resolve(v);
      };
      wrap.querySelector('#__pickCancel').onclick = function(){
        wrap.remove();
        resolve(null);
      };
    });
  };

  window.interpIDW = function interpIDW(lat, lon, pts, R, K){
    R = R || 60;
    K = K || 12;
    var cand = [];
    for(var i=0;i<pts.length;i++){
      var p = pts[i];
      var d = distM({lat:lat, lon:lon}, {lat:p.lat, lon:p.lon});
      if(d <= R) cand.push({d:d,p:p});
    }
    cand.sort(function(a,b){return a.d-b.d;});
    var take = cand.slice(0, Math.min(K, cand.length));
    if(!take.length) return NaN;
    var num=0, den=0;
    for(var j=0;j<take.length;j++){
      var it=take[j];
      var w=1/Math.max(1e-6,it.d*it.d);
      num+=w*it.p.dep;
      den+=w;
    }
    return num/den;
  };
})(window);
