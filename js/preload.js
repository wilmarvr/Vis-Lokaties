// --- FIX: 'touchleave' veilig mappen + fallback (voorkomt "wrong event specified: touchleave")
(function(){
  var hasTouch = (navigator.maxTouchPoints || 0) > 0;
  if (typeof window.L_NO_TOUCH === 'undefined') {
    window.L_NO_TOUCH = !hasTouch;
  }
  var supportsPointer = 'PointerEvent' in window;
  function patchTarget(target){
    if(!target || typeof target.addEventListener !== 'function' || target.__lvPatched){ return; }
    var _add = target.addEventListener;
    var patched = function(type, listener, options){
      if(type === 'touchleave' && !hasTouch){
        type = supportsPointer ? 'pointerleave' : 'mouseleave';
      }
      try { return _add.call(this, type, listener, options); }
      catch(e){
        if(type === 'touchleave'){
          try { return _add.call(this, 'mouseleave', listener, options); }
          catch(_){ return; }
        }
        throw e;
      }
    };
    patched.__lvPatched = true;
    target.addEventListener = patched;
  }
  if(window.EventTarget && window.EventTarget.prototype){ patchTarget(window.EventTarget.prototype); }
  patchTarget(window);
  patchTarget(document);
})();

// --- Vroeg: no-ops zodat whenReady-callbacks nooit breken
window.renderAll = window.renderAll || function(){};
window.drawDistances = window.drawDistances || function(){};
window.renderDatasets = window.renderDatasets || function(){};
