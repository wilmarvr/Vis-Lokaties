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
    target.addEventListener = function(type, listener, options){
      if(type === 'touchleave' && !supportsTouchleave){
        if(!fallbackLeave){ return; }
        type = fallbackLeave;
      }
      try { return _add.call(this, type, listener, options); }
      catch(e){
        if(type === 'touchleave' && fallbackLeave){
          try { return _add.call(this, fallbackLeave, listener, options); }
          catch(_){ return; }
        }
        throw e;
      }
    };
    target.__lvPatched = true;
  }
  [
    window.EventTarget && window.EventTarget.prototype,
    window.Element && window.Element.prototype,
    window.HTMLElement && window.HTMLElement.prototype,
    window.Document && window.Document.prototype,
    window,
    document
  ].forEach(function(target){ patchTarget(target); });
})();

(function(){
  if(typeof MouseEvent === 'undefined'){ return; }
  function define(name, getter){
    try {
      Object.defineProperty(MouseEvent.prototype, name, {
        configurable:true,
        get:getter,
        set:function(){},
      });
    } catch(_){ /* ignore – browser may not allow overriding */ }
  }
  define('mozPressure', function(){
    if(typeof this.pressure === 'number'){ return this.pressure; }
    if(this.pointerType && typeof this.pointerType === 'string'){
      return this.pointerType === 'touch' ? 0.5 : 0;
    }
    return 0;
  });
  define('mozInputSource', function(){
    var map = {mouse:1, pen:2, touch:4};
    if(this.pointerType && map[this.pointerType]){ return map[this.pointerType]; }
    if(typeof this.button === 'number'){ return this.button === -1 ? 0 : 1; }
    return 0;
  });
})();

// --- Vroeg: no-ops zodat whenReady-callbacks nooit breken
window.renderAll = window.renderAll || function(){};
window.drawDistances = window.drawDistances || function(){};
window.renderDatasets = window.renderDatasets || function(){};
