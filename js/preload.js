// --- FIX: 'touchleave' veilig mappen + fallback (voorkomt "wrong event specified: touchleave")
(function(){
  var hasTouch = ((navigator.maxTouchPoints || 0) > 0) || ('ontouchstart' in window);
  var supportsTouchleave = 'ontouchleave' in window;
  var docEl = (typeof document !== 'undefined') ? document.documentElement : null;
  if (!supportsTouchleave && docEl) {
    supportsTouchleave = ('ontouchleave' in docEl);
  }
  if (typeof window.L_NO_TOUCH === 'undefined') {
    window.L_NO_TOUCH = !(hasTouch && supportsTouchleave);
  }
  var supportsPointer = 'PointerEvent' in window;
  var fallbackLeave = supportsTouchleave ? null : (supportsPointer ? 'pointerleave' : 'mouseleave');
  function patchTarget(target){
    if(!target || typeof target.addEventListener !== 'function' || target.__lvPatched){ return; }
    var _add = target.addEventListener;
    var patched = function(type, listener, options){
      if(type === 'touchleave' && fallbackLeave){
        type = fallbackLeave;
      }
      try { return _add.call(this, type, listener, options); }
      catch(e){
        if(type === 'touchleave' || (!supportsTouchleave && fallbackLeave)){
          try { return _add.call(this, fallbackLeave || 'mouseleave', listener, options); }
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
