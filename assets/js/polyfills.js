(function(){
  var proto = window.EventTarget && EventTarget.prototype;
  if(!proto || proto.__touchleavePatched){ return; }
  var supportsPointer = 'onpointerleave' in document.documentElement;
  var originalAdd = proto.addEventListener;
  proto.addEventListener = function(type, listener, options){
    if(type === 'touchleave'){
      var fallback = supportsPointer ? 'pointerleave' : 'mouseleave';
      try {
        return originalAdd.call(this, fallback, listener, options);
      } catch (err){
        if(fallback !== 'mouseleave'){
          try { return originalAdd.call(this, 'mouseleave', listener, options); }
          catch (_){}
        }
        return;
      }
    }
    return originalAdd.call(this, type, listener, options);
  };
  proto.__touchleavePatched = true;
})();
