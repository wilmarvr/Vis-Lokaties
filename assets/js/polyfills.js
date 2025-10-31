(function(){
  var fallbackEvent = (function(){
    if(typeof document === 'undefined'){ return 'mouseleave'; }
    try {
      if('onpointerleave' in document.documentElement){ return 'pointerleave'; }
    } catch(_){ }
    return 'mouseleave';
  })();

  function patchTarget(target){
    if(!target || typeof target.addEventListener !== 'function' || target.__touchleavePatched){ return; }
    var add = target.addEventListener;
    var remove = target.removeEventListener;

    target.addEventListener = function(type, listener, options){
      if(type === 'touchleave'){
        try { return add.call(this, fallbackEvent, listener, options); }
        catch(err){
          if(fallbackEvent !== 'mouseleave'){
            try { return add.call(this, 'mouseleave', listener, options); }
            catch(_){ return; }
          }
          return;
        }
      }
      return add.call(this, type, listener, options);
    };

    target.removeEventListener = function(type, listener, options){
      if(type === 'touchleave'){
        try { return remove.call(this, fallbackEvent, listener, options); }
        catch(err){
          if(fallbackEvent !== 'mouseleave'){
            try { return remove.call(this, 'mouseleave', listener, options); }
            catch(_){ return; }
          }
          return;
        }
      }
      return remove.call(this, type, listener, options);
    };

    Object.defineProperty(target, '__touchleavePatched', {
      value:true,
      configurable:true
    });
  }

  patchTarget(window);
  patchTarget(document);
  if(typeof EventTarget !== 'undefined'){ patchTarget(EventTarget.prototype); }
  if(typeof Node !== 'undefined'){ patchTarget(Node.prototype); }
  if(typeof HTMLElement !== 'undefined'){ patchTarget(HTMLElement.prototype); }
})();
