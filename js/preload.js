// --- FIX: 'touchleave' veilig mappen + fallback (voorkomt "wrong event specified: touchleave")
(function(){
  var supportsPointer = 'PointerEvent' in window;
  var _add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options){
    if (type === 'touchleave') {
      try { return _add.call(this, supportsPointer ? 'pointerleave' : 'mouseleave', listener, options); }
      catch(e) {
        try { return _add.call(this, 'mouseleave', listener, options); }
        catch(e2){ return; }
      }
    }
    try { return _add.call(this, type, listener, options); }
    catch(e) {
      if (type === 'touchleave') {
        try { return _add.call(this, 'mouseleave', listener, options); } catch(_){ return; }
      }
      throw e;
    }
  };
})();

// --- Vroeg: no-ops zodat whenReady-callbacks nooit breken
window.renderAll = window.renderAll || function(){};
window.drawDistances = window.drawDistances || function(){};
window.renderDatasets = window.renderDatasets || function(){};
