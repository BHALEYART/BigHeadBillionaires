function Preloader() {
  var assetsLoaded = 0;
  var totalAssets = 0;
  var callback;

  // Preload an image
  function loadImage(url, onLoad) {
    var image = new Image();
    image.onload = onLoad;
    image.src = url;
  }

  // Preload an audio
  function loadAudio(url, onLoad) {
    var audio = new Audio();
    audio.addEventListener('canplaythrough', onLoad, false);
    audio.src = url;
  }

  // Handle asset loaded
  function assetLoaded() {
    assetsLoaded++;
    if (assetsLoaded === totalAssets && typeof callback === 'function') {
      callback();
    }
  }

  // Preload assets
  this.preload = function(assetsArray, onLoadCallback) {
    totalAssets = assetsArray.length;
    callback = onLoadCallback;

    for (var i = 0; i < assetsArray.length; i++) {
      var asset = assetsArray[i];
      if (asset.type === 'image') {
        loadImage(asset.url, assetLoaded);
      } else if (asset.type === 'audio') {
        loadAudio(asset.url, assetLoaded);
      }
    }
  };
}
