// Initialize variables
var canvas = document.getElementById("gameCanvas");
var ctx = canvas.getContext("2d");
var playerImage = new Image();
var playerImageOriginal = new Image();
var goodItemImage = new Image();
var badItemImage = new Image();
var surpriseItemImage = new Image();
var medicalItemImage = new Image();
var heartImage = new Image();
var gameOverImage = new Image();
var menuOverlayImage = new Image();
var gameOverPileImage = new Image();
var surpriseItemCounter = 0;
var restartButton = document.createElement("button");
var watchButton = document.createElement("button");
var controlToggleButton = document.createElement("button");
// startButton removed — game auto-starts after preload
var musicMuteButton = document.createElement("button");
var sfxMuteButton = document.createElement("button");

// Fixed canvas dimensions for vertical format
var GAME_WIDTH = 450;
var GAME_HEIGHT = 800;

var playerWidth = 70;
var playerHeight = 106;
var goodItemWidth = 40;
var goodItemHeight = 40;
var badItemWidth = 60;
var badItemHeight = 60;
var surpriseItemWidth = 40;
var surpriseItemHeight = 40;
var medicalItemWidth = 40;
var medicalItemHeight = 40;
var heartWidth = 30;
var heartHeight = 30;
var SCREEN_MARGIN_LEFT = 10;
var SCREEN_MARGIN_RIGHT = 10;
var SCREEN_MARGIN_BOTTOM = 50;

var playerX = GAME_WIDTH / 2 - playerWidth / 2;
var playerY = GAME_HEIGHT - playerHeight - SCREEN_MARGIN_BOTTOM;
var goodItems = [];
var badItems = [];
var surpriseItems = [];
var medicalItems = [];
var shieldItems = [];
var clockItems = [];
var nukeItems = [];
var fireItems = [];
var comboItems = [];
var gunItems = [];
var fireItems = [];
var maxItems = 8;
var itemSpeed = 2;
var maxFallSpeed = 24;
var fallAcceleration = 0.004;
var spawnCounter = 1;
var score = 0;
var hearts = 3;
var isGameOver = false;
var isPlayerImmune = false;
var immuneDuration = 10;
var immunityTimer = 0;
var gameStarted = false;
var audioInitialized = false;
var musicMuted = false;
var sfxMuted = false;
var damageFlash = 0;
var damageFlashDecay = 0.05;

var shieldActive = false;
var shieldDuration = 10;
var shieldTimer = 0;
var shieldItemWidth = 40;
var shieldItemHeight = 40;
var clockItemWidth = 40;
var clockItemHeight = 40;
var nukeItemWidth = 40;
var nukeItemHeight = 40;
var fireActive = false;
var fireDuration = 10;
var fireTimer = 0;
var fireItemWidth = 40;
var fireItemHeight = 40;
var fireActive = false;
var fireDuration = 10;
var fireTimer = 0;
var fireItemWidth = 40;
var fireItemHeight = 40;
var comboActive = false;
var comboDuration = 10;
var comboTimer = 0;
var comboItemWidth = 40;
var comboItemHeight = 40;
var nukeFlash = 0;
var nukeFlashDecay = 0.08;
var spawnDelay = 0;

var bossCountdownStarted = false;
var bossCountdownTimer = 10;
var bossActive = false;
var bossX = GAME_WIDTH / 2 - 40;
var bossY = -100;
var bossTargetY = 100;
var bossWidth = 80;
var bossHeight = 80;
var bossHealth = 4;
var bossMaxHealth = 4;
var bossDirection = 1;
var bossSpeed = 2;
var bossShootTimer = 0;
var bossShootInterval = 90;
var bossBeams = [];
var bossAttackPhase = 1;
var bossPhaseTimer = 0;
var bossPhaseDuration = 300;
var bossStunned = false;
var bossStunTimer = 0;
var bossStunDuration = 30;
var bossDefeated = false;
var bossDefeatTimer = 0;
var bossDefeatDuration = 90;
var bossShakeAmount = 0;
var gunItems = [];
var gunItemWidth = 40;
var gunItemHeight = 40;
var hasGun = false;
var developerMode = false;

// Delta-time tracking — normalizes all movement to 60fps regardless of display refresh rate
var lastTime = 0;

// Device detection
var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

var tiltEnabled = false;  // tilt removed — touch/drag only
var tiltCalibrated = false;
var tiltCenterGamma = 0;
var tiltSensitivity = 3.5;
var tiltSmoothing = 0.15;
var targetPlayerX = playerX;
var maxTiltAngle = 30;

// Audio variables
var backgroundMusic = new Audio("assets/game_music.mp3");
backgroundMusic.loop = true;
backgroundMusic.volume = 0.1;
var immuneMusic = new Audio("assets/immune_music.mp3");
immuneMusic.loop = false;
immuneMusic.volume = 0.3;
var goodItemSound = new Audio("assets/point_sound.mp3");
var badItemSound = new Audio("assets/damage_sound.mp3");
badItemSound.volume = 0.7;
var lowScoreSound = new Audio("assets/low_score_gameover.mp3");
lowScoreSound.volume = 0.7;
var highScoreSound = new Audio("assets/high_score_gameover.mp3");
highScoreSound.volume = 0.7;

function preloadAudio() {
  // Audio loads on demand — calling .load() on all files at startup
  // can trigger playback on some browsers before the user interacts.
}
}

function initializeAudio() {
  if (!audioInitialized) {
    audioInitialized = true;
    // Unlock audio on mobile using a silent Web Audio buffer.
    // We deliberately do NOT play/pause the <audio> elements here —
    // that approach fires them audibly before the pause can take effect.
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      src.onended = function() { ctx.close(); };
    } catch (e) {}
  }
}

function safePlayAudio(audio) {
  if (audioInitialized) {
    var isMusic = (audio === backgroundMusic || audio === immuneMusic);
    var isMuted = isMusic ? musicMuted : sfxMuted;
    if (!isMuted) {
      var playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(function(error) {
          console.log("Audio play error:", error);
        });
      }
    }
  }
}

// startButton and startTitle removed — game auto-starts after preload

restartButton.innerText = "Try Again?";
restartButton.style.position = "absolute";
restartButton.style.left = "50%";
restartButton.style.top = "60%";
restartButton.style.transform = "translate(-50%, -50%)";
restartButton.style.width = "120px";
restartButton.style.height = "45px";
restartButton.style.backgroundColor = "orange";
restartButton.style.color = "black";
restartButton.style.border = "none";
restartButton.style.borderRadius = "5px";
restartButton.style.zIndex = "9999";
restartButton.style.cursor = "pointer";
restartButton.style.fontSize = "16px";

watchButton.innerText = "BHB Links";
watchButton.style.position = "absolute";
watchButton.style.left = "50%";
watchButton.style.top = "70%";
watchButton.style.transform = "translate(-50%, -50%)";
watchButton.style.width = "120px";
watchButton.style.height = "45px";
watchButton.style.backgroundColor = "orange";
watchButton.style.color = "black";
watchButton.style.border = "none";
watchButton.style.borderRadius = "5px";
watchButton.style.zIndex = "9999";
watchButton.style.cursor = "pointer";
watchButton.style.fontSize = "16px";

musicMuteButton.innerText = "🎵";
musicMuteButton.style.position = "absolute";
musicMuteButton.style.left = "10px";
musicMuteButton.style.top = "10px";
musicMuteButton.style.width = "45px";
musicMuteButton.style.height = "45px";
musicMuteButton.style.backgroundColor = "rgba(255, 215, 0, 0.8)";
musicMuteButton.style.color = "black";
musicMuteButton.style.border = "2px solid black";
musicMuteButton.style.borderRadius = "50%";
musicMuteButton.style.zIndex = "9999";
musicMuteButton.style.cursor = "pointer";
musicMuteButton.style.fontSize = "20px";
musicMuteButton.style.display = "none";
musicMuteButton.title = "Toggle Music";

sfxMuteButton.innerText = "🔊";
sfxMuteButton.style.position = "absolute";
sfxMuteButton.style.left = "10px";
sfxMuteButton.style.top = "65px";
sfxMuteButton.style.width = "45px";
sfxMuteButton.style.height = "45px";
sfxMuteButton.style.backgroundColor = "rgba(255, 215, 0, 0.8)";
sfxMuteButton.style.color = "black";
sfxMuteButton.style.border = "2px solid black";
sfxMuteButton.style.borderRadius = "50%";
sfxMuteButton.style.zIndex = "9999";
sfxMuteButton.style.cursor = "pointer";
sfxMuteButton.style.fontSize = "20px";
sfxMuteButton.style.display = "none";
sfxMuteButton.title = "Toggle Sound Effects";

if (isMobile) {
  controlToggleButton.innerText = "📱 Tilt";
  controlToggleButton.style.position = "absolute";
  controlToggleButton.style.right = "10px";
  controlToggleButton.style.bottom = "10px";
  controlToggleButton.style.width = "90px";
  controlToggleButton.style.height = "40px";
  controlToggleButton.style.backgroundColor = "rgba(144, 238, 144, 0.8)";
  controlToggleButton.style.color = "black";
  controlToggleButton.style.border = "2px solid black";
  controlToggleButton.style.borderRadius = "5px";
  controlToggleButton.style.zIndex = "9999";
  controlToggleButton.style.fontWeight = "bold";
  controlToggleButton.style.fontSize = "14px";
  controlToggleButton.style.display = "none";
}

gameOverPileImage.src = "assets/game_over_pile.png";
playerImage.src = "assets/player.png";
playerImageOriginal.src = "assets/player_original.png";
goodItemImage.src = "assets/good_item.png";
badItemImage.src = "assets/bad_item.png";
surpriseItemImage.src = "assets/surprise_item.png";
medicalItemImage.src = "assets/medical_item.png";
heartImage.src = "assets/heart.png";
gameOverImage.src = "assets/game_over.png";
menuOverlayImage.src = "assets/menu_shader.png";

var imagesLoaded = 0;
var totalImages = 10;
var allImagesLoaded = false;

// Draw a simple preloader onto the canvas while images are loading
function drawPreloader() {
  if (allImagesLoaded) return;
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Title
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px Arial Black, Arial';
  ctx.fillStyle = '#FFD700';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.strokeText('🍔 BURGER DROP', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);
  ctx.fillText('🍔 BURGER DROP', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);

  // Progress bar background
  var barW = 280, barH = 18;
  var barX = (GAME_WIDTH - barW) / 2;
  var barY = GAME_HEIGHT / 2 + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 9);
  ctx.fill();

  // Progress bar fill
  var pct = totalImages > 0 ? imagesLoaded / totalImages : 0;
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.roundRect(barX, barY, Math.round(barW * pct), barH, 9);
  ctx.fill();

  // Label
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('LOADING… ' + Math.round(pct * 100) + '%', GAME_WIDTH / 2, barY + barH + 22);

  ctx.textAlign = 'left';
  requestAnimationFrame(drawPreloader);
}

function imageLoaded() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) {
    allImagesLoaded = true;
    // All images ready — auto-start on next frame
    requestAnimationFrame(startGame);
  }
}

// Kick off the canvas preloader immediately
requestAnimationFrame(drawPreloader);

gameOverPileImage.onload = imageLoaded;
playerImage.onload = imageLoaded;
playerImageOriginal.onload = imageLoaded;
goodItemImage.onload = imageLoaded;
badItemImage.onload = imageLoaded;
surpriseItemImage.onload = imageLoaded;
medicalItemImage.onload = imageLoaded;
heartImage.onload = imageLoaded;
gameOverImage.onload = imageLoaded;
menuOverlayImage.onload = imageLoaded;

preloadAudio();

function setCanvasSize() {
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  canvas.style.maxWidth = "100%";
  canvas.style.maxHeight = "100vh";
  canvas.style.width = GAME_WIDTH + "px";
  canvas.style.height = GAME_HEIGHT + "px";
  if (isMobile) {
    var scale = Math.min(
      window.innerWidth / GAME_WIDTH,
      window.innerHeight / GAME_HEIGHT
    );
    canvas.style.width = (GAME_WIDTH * scale) + "px";
    canvas.style.height = (GAME_HEIGHT * scale) + "px";
  }
}

function startGame() {
  if (!gameStarted) {
    gameStarted = true;
    initializeAudio();
    musicMuteButton.style.display = "block";
    sfxMuteButton.style.display = "block";
    document.body.appendChild(musicMuteButton);
    document.body.appendChild(sfxMuteButton);
    setTimeout(function() {
      if (!musicMuted) {
        setTimeout(function() {
          safePlayAudio(backgroundMusic);
        }, 2000);
      }
    }, 500);
    resetItems();
    requestAnimationFrame(update);
  }
}

// Remove the click listener — game starts automatically
// startButton.addEventListener("click", startGame);

musicMuteButton.addEventListener("click", function() {
  musicMuted = !musicMuted;
  if (musicMuted) {
    musicMuteButton.innerText = "🎵";
    musicMuteButton.style.textDecoration = "line-through";
    musicMuteButton.style.backgroundColor = "rgba(169, 169, 169, 0.8)";
    backgroundMusic.pause();
    immuneMusic.pause();
  } else {
    musicMuteButton.innerText = "🎵";
    musicMuteButton.style.textDecoration = "none";
    musicMuteButton.style.backgroundColor = "rgba(255, 215, 0, 0.8)";
    if (gameStarted && !isGameOver) {
      safePlayAudio(backgroundMusic);
    }
  }
});

sfxMuteButton.addEventListener("click", function() {
  sfxMuted = !sfxMuted;
  if (sfxMuted) {
    sfxMuteButton.innerText = "🔇";
    sfxMuteButton.style.backgroundColor = "rgba(169, 169, 169, 0.8)";
  } else {
    sfxMuteButton.innerText = "🔊";
    sfxMuteButton.style.backgroundColor = "rgba(255, 215, 0, 0.8)";
  }
});

function requestOrientationPermission() { /* tilt removed */ }
function enableTiltControls()           { /* tilt removed */ }
function disableTiltControls()          { /* tilt removed */ }
function handleTilt()                   { /* tilt removed */ }

function updatePlayerPosition() {
  // touch/drag only — tilt removed
}

// controlToggleButton removed — touch/drag only

function checkCollision() {
  var hitboxMargin = 4;

  for (var i = 0; i < goodItems.length; i++) {
    var goodItem = goodItems[i];
    if (
      playerX + hitboxMargin < goodItem.x + goodItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > goodItem.x + hitboxMargin &&
      playerY + hitboxMargin < goodItem.y + goodItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > goodItem.y + hitboxMargin
    ) {
      var pointMultiplier = itemSpeed >= maxFallSpeed ? 25 : 10;
      var points = pointMultiplier * itemSpeed;
      if (goodItem.shieldTripled) { points *= 3; }
      score += points;
      safePlayAudio(goodItemSound);
      goodItems.splice(i, 1);
    }
  }

  for (var i = 0; i < badItems.length; i++) {
    var badItem = badItems[i];
    if (
      playerX + hitboxMargin < badItem.x + badItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > badItem.x + hitboxMargin &&
      playerY + hitboxMargin < badItem.y + badItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > badItem.y + hitboxMargin
    ) {
      if (!isPlayerImmune) {
        hearts--;
        score -= 50;
        safePlayAudio(badItemSound);
        maxItems += 1;
        damageFlash = 1.0;
      }
      badItems.splice(i, 1);
    }
  }

  for (var i = 0; i < medicalItems.length; i++) {
    var medicalItem = medicalItems[i];
    if (
      playerX + hitboxMargin < medicalItem.x + medicalItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > medicalItem.x + hitboxMargin &&
      playerY + hitboxMargin < medicalItem.y + medicalItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > medicalItem.y + hitboxMargin
    ) {
      if (hearts < 3) {
        hearts = 3;
        score += 100;
        maxItems += 1;
        medicalItems.splice(i, 1);
      }
    }
  }

  for (var i = 0; i < surpriseItems.length; i++) {
    var surpriseItem = surpriseItems[i];
    if (
      playerX + hitboxMargin < surpriseItem.x + surpriseItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > surpriseItem.x + hitboxMargin &&
      playerY + hitboxMargin < surpriseItem.y + surpriseItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > surpriseItem.y + hitboxMargin
    ) {
      maxItems += 1;
      score += 100;
      safePlayAudio(immuneMusic);
      isPlayerImmune = true;
      immunityTimer = immuneDuration;
      surpriseItems.splice(i, 1);
      if (isPlayerImmune == true) {
        playerImage.src = "assets/player.png";
      } else {
        playerImage.src = "assets/player_original.png";
      }
      surpriseItemCounter++;
    }
  }

  for (var i = 0; i < shieldItems.length; i++) {
    var shieldItem = shieldItems[i];
    if (
      playerX + hitboxMargin < shieldItem.x + shieldItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > shieldItem.x + hitboxMargin &&
      playerY + hitboxMargin < shieldItem.y + shieldItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > shieldItem.y + hitboxMargin
    ) {
      shieldActive = true;
      shieldTimer = shieldDuration;
      score += 100;
      safePlayAudio(goodItemSound);
      shieldItems.splice(i, 1);
    }
  }

  for (var i = 0; i < clockItems.length; i++) {
    var clockItem = clockItems[i];
    if (
      playerX + hitboxMargin < clockItem.x + clockItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > clockItem.x + hitboxMargin &&
      playerY + hitboxMargin < clockItem.y + clockItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > clockItem.y + hitboxMargin
    ) {
      itemSpeed = Math.max(2, itemSpeed - 3);
      score += 100;
      safePlayAudio(goodItemSound);
      clockItems.splice(i, 1);
    }
  }

  for (var i = 0; i < nukeItems.length; i++) {
    var nukeItem = nukeItems[i];
    if (
      playerX + hitboxMargin < nukeItem.x + nukeItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > nukeItem.x + hitboxMargin &&
      playerY + hitboxMargin < nukeItem.y + nukeItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > nukeItem.y + hitboxMargin
    ) {
      for (var j = 0; j < goodItems.length; j++) {
        var pointMultiplier = itemSpeed >= maxFallSpeed ? 25 : 10;
        score += (pointMultiplier * itemSpeed) * 2;
      }
      goodItems = [];
      badItems = [];
      surpriseItems = [];
      medicalItems = [];
      shieldItems = [];
      clockItems = [];
      fireItems = [];
      itemSpeed = Math.max(2, itemSpeed - 5);
      score += 200;
      safePlayAudio(goodItemSound);
      nukeFlash = 1.0;
      spawnDelay = 0.2;
      nukeItems.splice(i, 1);
    }
  }

  for (var i = 0; i < fireItems.length; i++) {
    var fireItem = fireItems[i];
    if (
      playerX + hitboxMargin < fireItem.x + fireItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > fireItem.x + hitboxMargin &&
      playerY + hitboxMargin < fireItem.y + fireItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > fireItem.y + hitboxMargin
    ) {
      fireActive = true;
      fireTimer = fireDuration;
      score += 100;
      safePlayAudio(goodItemSound);
      fireItems.splice(i, 1);
    }
  }

  for (var i = 0; i < comboItems.length; i++) {
    var comboItem = comboItems[i];
    if (
      playerX + hitboxMargin < comboItem.x + comboItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > comboItem.x + hitboxMargin &&
      playerY + hitboxMargin < comboItem.y + comboItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > comboItem.y + hitboxMargin
    ) {
      comboActive = true;
      comboTimer = comboDuration;
      score += 200;
      safePlayAudio(goodItemSound);
      comboItems.splice(i, 1);
    }
  }

  for (var i = 0; i < gunItems.length; i++) {
    var gunItem = gunItems[i];
    if (
      playerX + hitboxMargin < gunItem.x + gunItemWidth - hitboxMargin &&
      playerX + playerWidth - hitboxMargin > gunItem.x + hitboxMargin &&
      playerY + hitboxMargin < gunItem.y + gunItemHeight - hitboxMargin &&
      playerY + playerHeight - hitboxMargin > gunItem.y + hitboxMargin
    ) {
      if (bossActive && bossHealth > 0 && !bossDefeated) {
        bossHealth--;
        score += 500;
        safePlayAudio(badItemSound);
        if (bossHealth > 0) {
          bossStunned = true;
          bossStunTimer = bossStunDuration;
        }
      }
      gunItems.splice(i, 1);
    }
  }
}

function resetItems() {
  if (spawnDelay > 0) {
    spawnDelay -= _dt / 60;
    return;
  }

  if (bossDefeated && bossDefeatTimer > 0) {
    return;
  }

  if (bossActive && bossHealth > 0) {
    if (goodItems.length + clockItems.length + gunItems.length < 6) {
      var randomNum = Math.random();
      var spawnableWidth = GAME_WIDTH - SCREEN_MARGIN_LEFT - SCREEN_MARGIN_RIGHT;
      if (randomNum < 0.94) {
        var goodItem = {
          x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - goodItemWidth),
          y: -goodItemHeight,
          speed: itemSpeed
        };
        goodItems.push(goodItem);
      } else if (randomNum < 0.96) {
        var clockItem = {
          x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - clockItemWidth),
          y: -clockItemHeight,
          speed: itemSpeed
        };
        clockItems.push(clockItem);
      } else {
        var gunItem = {
          x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - gunItemWidth),
          y: -gunItemHeight,
          speed: itemSpeed
        };
        gunItems.push(gunItem);
      }
    }
    return;
  }

  if (goodItems.length + badItems.length + surpriseItems.length + shieldItems.length + clockItems.length + nukeItems.length + fireItems.length + comboItems.length < maxItems) {
    var randomNum = Math.random();
    var spawnableWidth = GAME_WIDTH - SCREEN_MARGIN_LEFT - SCREEN_MARGIN_RIGHT;

    var powerUpActive = shieldActive || isPlayerImmune;
    var comboRestriction = comboActive;

    var burgerChance = 0.85;
    var trashChance = 0.975;
    var currentChance = trashChance;

    var canSpawnImmunity = itemSpeed >= 10 && itemSpeed < 20 && !powerUpActive && !comboRestriction;
    var canSpawnShield = itemSpeed >= 10 && !powerUpActive && !comboRestriction;
    var canSpawnFire = itemSpeed >= 10 && !powerUpActive && !comboRestriction;
    var canSpawnMedical = !powerUpActive;
    var canSpawnClock = itemSpeed >= 12 && !powerUpActive && !comboRestriction;
    var canSpawnNuke = itemSpeed >= 16 && !powerUpActive && !comboRestriction;
    var canSpawnCombo = itemSpeed >= 18 && !powerUpActive && !comboRestriction;

    if (canSpawnImmunity) { currentChance += 0.01; var immunityChance = currentChance; }
    if (canSpawnShield)   { currentChance += 0.005; var shieldChance = currentChance; }
    if (canSpawnFire)     { currentChance += 0.005; var fireChance = currentChance; }
    if (canSpawnMedical)  { currentChance += 0.0035; var medicalChance = currentChance; }
    if (canSpawnClock)    { var clockRate = itemSpeed >= 16 ? 0.007 : 0.0035; currentChance += clockRate; var clockChance = currentChance; }
    if (canSpawnNuke)     { var nukeRate = itemSpeed >= 16 ? 0.006 : 0.003; currentChance += nukeRate; var nukeChance = currentChance; }
    if (canSpawnCombo)    { currentChance += 0.004; var comboChance = currentChance; }

    if (randomNum < burgerChance) {
      var goodItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - goodItemWidth), y: -goodItemHeight, speed: itemSpeed };
      goodItems.push(goodItem);
    } else if (randomNum < trashChance) {
      var badItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - badItemWidth), y: -badItemHeight, speed: itemSpeed };
      badItems.push(badItem);
    } else if (canSpawnImmunity && randomNum < immunityChance) {
      var surpriseItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - surpriseItemWidth), y: -surpriseItemHeight, speed: itemSpeed };
      surpriseItems.push(surpriseItem);
    } else if (canSpawnShield && randomNum < shieldChance) {
      var shieldItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - shieldItemWidth), y: -shieldItemHeight, speed: itemSpeed };
      shieldItems.push(shieldItem);
    } else if (canSpawnFire && randomNum < fireChance) {
      var fireItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - fireItemWidth), y: -fireItemHeight, speed: itemSpeed };
      fireItems.push(fireItem);
    } else if (canSpawnMedical && randomNum < medicalChance) {
      var medicalItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - medicalItemWidth), y: -medicalItemHeight, speed: itemSpeed };
      medicalItems.push(medicalItem);
    } else if (canSpawnClock && randomNum < clockChance) {
      var clockItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - clockItemWidth), y: -clockItemHeight, speed: itemSpeed };
      clockItems.push(clockItem);
    } else if (canSpawnNuke && randomNum < nukeChance) {
      var nukeItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - nukeItemWidth), y: -nukeItemHeight, speed: itemSpeed };
      nukeItems.push(nukeItem);
    } else if (canSpawnCombo && randomNum < comboChance) {
      var comboItem = { x: SCREEN_MARGIN_LEFT + Math.random() * (spawnableWidth - comboItemWidth), y: -comboItemHeight, speed: itemSpeed };
      comboItems.push(comboItem);
    }
  }
}

// ─── MAIN GAME LOOP ───────────────────────────────────────────────────────────
// timestamp is provided by requestAnimationFrame.
// dt normalizes all movement to 60fps:
//   dt = 1.0  at 60Hz  (16.7ms/frame)
//   dt = 2.0  at 120Hz (8.3ms/frame)
//   dt = 2.4  at 144Hz (6.9ms/frame)
// Capped at 3 to prevent huge jumps when tab is backgrounded.
var _dt = 1;  // Global dt accessible by helper functions (resetItems, updatePlayerPosition)

function update(timestamp) {
  if (!gameStarted || !allImagesLoaded) { requestAnimationFrame(update); return; }

  _dt = lastTime ? Math.min((timestamp - lastTime) / (1000 / 60), 3) : 1;
  lastTime = timestamp;

  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  updatePlayerPosition();

  ctx.font = "bold 42px 'Arial Black', Arial, sans-serif";
  ctx.fillStyle = "#FFD700";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 5;
  ctx.textAlign = "center";
  ctx.strokeText("BURGER DROP", GAME_WIDTH / 2, 50);
  ctx.fillText("BURGER DROP", GAME_WIDTH / 2, 50);

  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  ctx.strokeText("Mobile & PC Supported", GAME_WIDTH / 2, 75);
  ctx.fillText("Mobile & PC Supported", GAME_WIDTH / 2, 75);

  ctx.font = "bold 18px Arial";
  ctx.fillStyle = "lightblue";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  if (isMobile) {
    ctx.strokeText("Drag to Move", GAME_WIDTH / 2, 100);
    ctx.fillText("Drag to Move", GAME_WIDTH / 2, 100);
    ctx.strokeText("Catch Burgers! Avoid Trash!", GAME_WIDTH / 2, 120);
    ctx.fillText("Catch Burgers! Avoid Trash!", GAME_WIDTH / 2, 120);
  } else {
    ctx.strokeText("Move Mouse to Control", GAME_WIDTH / 2, 100);
    ctx.fillText("Move Mouse to Control", GAME_WIDTH / 2, 100);
    ctx.strokeText("Catch Burgers! Avoid Trash!", GAME_WIDTH / 2, 120);
    ctx.fillText("Catch Burgers! Avoid Trash!", GAME_WIDTH / 2, 120);
  }
  ctx.textAlign = "left";

  if (isPlayerImmune) {
    ctx.drawImage(playerImage, playerX, playerY, playerWidth, playerHeight);
  } else {
    ctx.drawImage(playerImageOriginal, playerX, playerY, playerWidth, playerHeight);
  }

  // Good items
  for (var i = 0; i < goodItems.length; i++) {
    var goodItem = goodItems[i];
    ctx.font = goodItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🍔", goodItem.x + goodItemWidth/2, goodItem.y + goodItemHeight/2);
    goodItem.y += goodItem.speed * _dt;
    if (goodItem.y > GAME_HEIGHT) { goodItems.splice(i, 1); }
  }

  // Bad items
  for (var i = 0; i < badItems.length; i++) {
    var badItem = badItems[i];
    ctx.font = badItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💣", badItem.x + badItemWidth/2, badItem.y + badItemHeight/2);
    badItem.y += badItem.speed * _dt;
    if (badItem.y > GAME_HEIGHT) { badItems.splice(i, 1); }
  }

  // Surprise items
  for (var i = 0; i < surpriseItems.length; i++) {
    var surpriseItem = surpriseItems[i];
    ctx.font = surpriseItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🦠", surpriseItem.x + surpriseItemWidth/2, surpriseItem.y + surpriseItemHeight/2);
    surpriseItem.y += surpriseItem.speed * _dt;
    if (surpriseItem.y > GAME_HEIGHT) { surpriseItems.splice(i, 1); }
  }

  // Medical items
  for (var i = 0; i < medicalItems.length; i++) {
    var medicalItem = medicalItems[i];
    ctx.font = medicalItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⛑️", medicalItem.x + medicalItemWidth/2, medicalItem.y + medicalItemHeight/2);
    medicalItem.y += medicalItem.speed * _dt;
    if (medicalItem.y > GAME_HEIGHT) { medicalItems.splice(i, 1); }
  }

  // Shield items
  for (var i = 0; i < shieldItems.length; i++) {
    var shieldItem = shieldItems[i];
    ctx.font = shieldItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🛡️", shieldItem.x + shieldItemWidth/2, shieldItem.y + shieldItemHeight/2);
    shieldItem.y += shieldItem.speed * _dt;
    if (shieldItem.y > GAME_HEIGHT) { shieldItems.splice(i, 1); }
  }

  // Clock items
  for (var i = 0; i < clockItems.length; i++) {
    var clockItem = clockItems[i];
    ctx.font = clockItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🕐", clockItem.x + clockItemWidth/2, clockItem.y + clockItemHeight/2);
    clockItem.y += clockItem.speed * _dt;
    if (clockItem.y > GAME_HEIGHT) { clockItems.splice(i, 1); }
  }

  // Nuke items
  for (var i = 0; i < nukeItems.length; i++) {
    var nukeItem = nukeItems[i];
    ctx.font = nukeItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🍟", nukeItem.x + nukeItemWidth/2, nukeItem.y + nukeItemHeight/2);
    nukeItem.y += nukeItem.speed * _dt;
    if (nukeItem.y > GAME_HEIGHT) { nukeItems.splice(i, 1); }
  }

  // Fire items
  for (var i = 0; i < fireItems.length; i++) {
    var fireItem = fireItems[i];
    ctx.font = fireItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔥", fireItem.x + fireItemWidth/2, fireItem.y + fireItemHeight/2);
    fireItem.y += fireItem.speed * _dt;
    if (fireItem.y > GAME_HEIGHT) { fireItems.splice(i, 1); }
  }

  // Combo items
  for (var i = 0; i < comboItems.length; i++) {
    var comboItem = comboItems[i];
    ctx.font = comboItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⭐", comboItem.x + comboItemWidth/2, comboItem.y + comboItemHeight/2);
    comboItem.y += comboItem.speed * _dt;
    if (comboItem.y > GAME_HEIGHT) { comboItems.splice(i, 1); }
  }

  // Gun items
  for (var i = 0; i < gunItems.length; i++) {
    var gunItem = gunItems[i];
    ctx.font = gunItemWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🔫", gunItem.x + gunItemWidth/2, gunItem.y + gunItemHeight/2);
    gunItem.y += gunItem.speed * _dt;
    if (gunItem.y > GAME_HEIGHT) { gunItems.splice(i, 1); }
  }

  // Boss
  if (bossActive) {
    if (bossStunned && Math.floor(bossStunTimer / 5) % 2 === 0) {
      ctx.shadowColor = "white";
      ctx.shadowBlur = 20;
    }
    var shakeX = 0;
    var shakeY = 0;
    if (bossShakeAmount > 0) {
      shakeX = (Math.random() - 0.5) * bossShakeAmount * 2;
      shakeY = (Math.random() - 0.5) * bossShakeAmount * 2;
    }
    ctx.font = bossWidth + "px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🤖", bossX + bossWidth/2 + shakeX, bossY + bossHeight/2 + shakeY);
    ctx.shadowBlur = 0;

    if (bossHealth > 0 && !bossDefeated) {
      ctx.font = "bold 24px 'Arial Black', Arial, sans-serif";
      ctx.fillStyle = "white";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 3;
      ctx.textAlign = "left";
      ctx.strokeText("BOSS:", 10, 50);
      ctx.fillText("BOSS:", 10, 50);
      ctx.font = "30px Arial";
      for (var i = 0; i < bossHealth; i++) {
        ctx.fillText("🎯", 90 + (i * 40), 50);
      }
      ctx.textAlign = "center";
    }
  }

  // Boss beams
  for (var i = 0; i < bossBeams.length; i++) {
    var beam = bossBeams[i];
    if (beam.type === 'narrow') {
      ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
      ctx.fillRect(beam.x, beam.y, beam.width, beam.height);
      ctx.shadowColor = "red";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(255, 100, 100, 0.6)";
      ctx.fillRect(beam.x - 2, beam.y, beam.width + 4, beam.height);
      ctx.shadowBlur = 0;
    } else if (beam.type === 'wide') {
      ctx.fillStyle = "rgba(255, 50, 0, 0.7)";
      ctx.fillRect(beam.x, beam.y, beam.width, beam.height);
      ctx.shadowColor = "orange";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "rgba(255, 150, 0, 0.5)";
      ctx.fillRect(beam.x, beam.y - 5, beam.width, beam.height + 10);
      ctx.shadowBlur = 0;
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Shield line
  if (shieldActive) {
    var shieldY = playerY - 375;
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 4;
    ctx.shadowColor = "cyan";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, shieldY);
    ctx.lineTo(GAME_WIDTH, shieldY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (var i = badItems.length - 1; i >= 0; i--) {
      var badItem = badItems[i];
      if (badItem.y + badItemHeight >= shieldY && badItem.y <= shieldY + 4) {
        badItems.splice(i, 1);
      }
    }
    for (var i = 0; i < goodItems.length; i++) {
      var goodItem = goodItems[i];
      if (goodItem.y + goodItemHeight >= shieldY && goodItem.y <= shieldY + 4 && !goodItem.shieldTripled) {
        goodItem.shieldTripled = true;
      }
    }
  }

  // Fire line
  if (fireActive) {
    var fireY = playerY - 380;
    ctx.strokeStyle = "red";
    ctx.lineWidth = 4;
    ctx.shadowColor = "red";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, fireY);
    ctx.lineTo(GAME_WIDTH, fireY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (var i = goodItems.length - 1; i >= 0; i--) {
      var goodItem = goodItems[i];
      if (goodItem.y + goodItemHeight >= fireY && goodItem.y <= fireY + 4) {
        var pointMultiplier = itemSpeed >= maxFallSpeed ? 25 : 10;
        var points = pointMultiplier * itemSpeed;
        if (goodItem.shieldTripled) { points *= 3; }
        score += points;
        safePlayAudio(goodItemSound);
        goodItems.splice(i, 1);
      }
    }
  }

  // Combo line
  if (comboActive) {
    var comboY = playerY - 370;
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 5;
    ctx.shadowColor = "lime";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(0, comboY);
    ctx.lineTo(GAME_WIDTH, comboY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (var i = badItems.length - 1; i >= 0; i--) {
      var badItem = badItems[i];
      if (badItem.y + badItemHeight >= comboY && badItem.y <= comboY + 4) {
        badItems.splice(i, 1);
      }
    }
    for (var i = goodItems.length - 1; i >= 0; i--) {
      var goodItem = goodItems[i];
      if (goodItem.y + goodItemHeight >= comboY && goodItem.y <= comboY + 4) {
        var pointMultiplier = itemSpeed >= maxFallSpeed ? 25 : 10;
        var points = (pointMultiplier * itemSpeed) * 3;
        score += points;
        safePlayAudio(goodItemSound);
        goodItems.splice(i, 1);
      }
    }
  }

  checkCollision();

  // Score
  ctx.font = "bold 28px 'Arial Black', Arial, sans-serif";
  ctx.fillStyle = "orange";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  ctx.strokeText("🏆 " + Math.floor(score), 10, 150);
  ctx.fillText("🏆 " + Math.floor(score), 10, 150);
  if (score <= 0) { score = 0; }
  // Live score feed — portal uses this for the header display only (not leaderboard)
  window.parent.postMessage({ type: 'bhb:score', game: 'burgerdrop', score: Math.floor(score) }, '*');

  // Speed
  ctx.font = "bold 28px 'Arial Black', Arial, sans-serif";
  ctx.fillStyle = "yellow";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  var speedText = itemSpeed >= maxFallSpeed ? "⚡ MAX" : "⚡ " + Math.floor(itemSpeed);
  ctx.strokeText(speedText, 220, 150);
  ctx.fillText(speedText, 220, 150);

  // Hearts
  for (var i = 0; i < hearts; i++) {
    var heartX = GAME_WIDTH - heartWidth - 10;
    var heartY = 10 + (i * (heartHeight + 10));
    ctx.drawImage(heartImage, heartX, heartY, heartWidth, heartHeight);
  }

  // Boss countdown
  if (bossCountdownStarted && !bossActive) {
    ctx.font = "bold 36px 'Arial Black', Arial, sans-serif";
    ctx.fillStyle = "red";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.textAlign = "center";
    ctx.strokeText("⚠️ BOSS IN " + Math.ceil(bossCountdownTimer) + "s ⚠️", GAME_WIDTH / 2, 400);
    ctx.fillText("⚠️ BOSS IN " + Math.ceil(bossCountdownTimer) + "s ⚠️", GAME_WIDTH / 2, 400);
    ctx.textAlign = "left";
  }

  if (isPlayerImmune) {
    ctx.font = "bold 26px 'Arial Black', Arial, sans-serif";
    ctx.fillStyle = "lightgreen";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.strokeText("IMMUNITY: " + Math.floor(immunityTimer) + "s", 10, 180);
    ctx.fillText("IMMUNITY: " + Math.floor(immunityTimer) + "s", 10, 180);
  }

  if (shieldActive) {
    ctx.font = "bold 26px 'Arial Black', Arial, sans-serif";
    ctx.fillStyle = "cyan";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.strokeText("SHIELD: " + Math.floor(shieldTimer) + "s", 10, 210);
    ctx.fillText("SHIELD: " + Math.floor(shieldTimer) + "s", 10, 210);
  }

  if (fireActive) {
    ctx.font = "bold 26px 'Arial Black', Arial, sans-serif";
    ctx.fillStyle = "orange";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.strokeText("FIRE: " + Math.floor(fireTimer) + "s", 10, 240);
    ctx.fillText("FIRE: " + Math.floor(fireTimer) + "s", 10, 240);
  }

  if (comboActive) {
    ctx.font = "bold 28px 'Arial Black', Arial, sans-serif";
    ctx.fillStyle = "lime";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.strokeText("⭐ COMBO: " + Math.floor(comboTimer) + "s ⭐", 10, 270);
    ctx.fillText("⭐ COMBO: " + Math.floor(comboTimer) + "s ⭐", 10, 270);
  }

  if (!isMobile) {
    ctx.font = "16px Arial";
    ctx.fillStyle = "lightblue";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.strokeText("🖱️ MOUSE MODE", 10, GAME_HEIGHT - 40);
    ctx.fillText("🖱️ MOUSE MODE", 10, GAME_HEIGHT - 40);
  }

  ctx.font = "14px Arial";
  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  ctx.textAlign = "center";
  ctx.strokeText("V7 Created by BHaleyArt", GAME_WIDTH / 2, GAME_HEIGHT - 10);
  ctx.fillText("V7 Created by BHaleyArt", GAME_WIDTH / 2, GAME_HEIGHT - 10);
  ctx.textAlign = "left";

  // Damage flash
  if (damageFlash > 0) {
    ctx.fillStyle = "rgba(255, 0, 0, " + (damageFlash * 0.4) + ")";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    damageFlash -= damageFlashDecay * _dt;
    if (damageFlash < 0) damageFlash = 0;
  }

  // Nuke flash
  if (nukeFlash > 0) {
    var flashColor = Math.floor(nukeFlash * 10) % 2 === 0 ? "rgba(255, 255, 255, " : "rgba(255, 255, 0, ";
    ctx.fillStyle = flashColor + (nukeFlash * 0.5) + ")";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    nukeFlash -= nukeFlashDecay * _dt;
    if (nukeFlash < 0) nukeFlash = 0;
  }

  if (hearts <= 0) {
    isGameOver = true;
    if (!musicMuted) { backgroundMusic.pause(); }
    ctx.drawImage(gameOverImage, GAME_WIDTH / 2 - 150, GAME_HEIGHT / 2 - 280, 300, 300);
    if (score < 1000) {
      safePlayAudio(lowScoreSound);
    } else {
      safePlayAudio(highScoreSound);
    }
    // Fire once to the parent portal for leaderboard submission
    if (!window._burgerdropGameOverPosted) {
      window._burgerdropGameOverPosted = true;
      try {
        window.parent.postMessage({
          type:   'BHB_SCORE',
          game:   'burgerdrop',
          mode:   'campaign',
          score:  Math.max(0, Math.floor(score)),
          level:  1,
          reason: 'gameover',
        }, '*');
      } catch (_) {}
    }
    document.body.appendChild(restartButton);
    document.body.appendChild(watchButton);
    ctx.drawImage(gameOverPileImage, -70, GAME_HEIGHT - 420, 600, 600);
    return;
  }

  // Power-up timers
  if (isPlayerImmune) {
    immunityTimer -= _dt / 60;
    if (immunityTimer <= 0) {
      isPlayerImmune = false;
      if (!musicMuted) { immuneMusic.pause(); immuneMusic.currentTime = 0; }
      playerImage.src = "assets/player_original.png";
    }
  }

  if (shieldActive) {
    shieldTimer -= _dt / 60;
    if (shieldTimer <= 0) { shieldActive = false; }
  }

  if (fireActive) {
    fireTimer -= _dt / 60;
    if (fireTimer <= 0) { fireActive = false; }
  }

  if (comboActive) {
    comboTimer -= _dt / 60;
    if (comboTimer <= 0) { comboActive = false; }
  }

  // Speed acceleration
  var currentAcceleration = itemSpeed >= 10 ? fallAcceleration * 0.5 : fallAcceleration;
  itemSpeed += currentAcceleration * _dt;
  if (itemSpeed > maxFallSpeed) { itemSpeed = maxFallSpeed; }

  // Boss countdown
  if ((itemSpeed >= maxFallSpeed || developerMode) && !bossCountdownStarted && !bossActive) {
    bossCountdownStarted = true;
    bossCountdownTimer = 10;
  }

  if (bossCountdownStarted && !bossActive) {
    bossCountdownTimer -= _dt / 60;
    if (bossCountdownTimer <= 0) {
      bossActive = true;
      bossY = -100;
      bossHealth = bossMaxHealth;
      bossAttackPhase = 1;
      bossPhaseTimer = 0;
      bossStunned = false;
      bossStunTimer = 0;
      hasGun = false;
      goodItems = [];
      badItems = [];
      surpriseItems = [];
      medicalItems = [];
      shieldItems = [];
      fireItems = [];
      comboItems = [];
      nukeItems = [];
    }
  }

  // Boss AI
  if (bossActive) {
    if (bossHealth > 0 && !bossDefeated) {
      if (bossY < bossTargetY) {
        bossY += 2 * _dt;
      } else {
        if (bossStunned) {
          bossStunTimer -= _dt;
          if (bossStunTimer <= 0) { bossStunned = false; }
        } else {
          bossPhaseTimer += _dt;
          if (bossPhaseTimer >= bossPhaseDuration) {
            bossPhaseTimer = 0;
            bossAttackPhase++;
            if (bossAttackPhase > 3) bossAttackPhase = 1;
            bossShootTimer = 0;
          }

          // Phase 1: side-to-side + narrow beams
          if (bossAttackPhase === 1) {
            bossX += bossSpeed * bossDirection * _dt;
            if (bossX <= 0) { bossX = 0; bossDirection = 1; }
            else if (bossX >= GAME_WIDTH - bossWidth) { bossX = GAME_WIDTH - bossWidth; bossDirection = -1; }
            bossShootTimer += _dt;
            if (bossShootTimer >= bossShootInterval) {
              bossShootTimer = 0;
              bossBeams.push({ x: bossX + bossWidth/2 - 5, y: bossY + bossHeight, width: 10, height: 0, growing: true, type: 'narrow' });
            }
          }

          // Phase 2: wide lasers from sides
          else if (bossAttackPhase === 2) {
            bossShootTimer += _dt;
            var phaseProgress = bossPhaseTimer / bossPhaseDuration;
            if (phaseProgress < 0.5) {
              bossX = GAME_WIDTH - bossWidth - 10;
              if (bossShootTimer === 30 || bossShootTimer === 90 || bossShootTimer === 150) {
                bossBeams.push({ x: bossX + bossWidth/2 - 60, y: bossY + bossHeight, width: 120, height: 0, growing: true, type: 'wide' });
              }
            } else {
              bossX = 10;
              if (bossShootTimer === 180 || bossShootTimer === 240) {
                bossBeams.push({ x: bossX + bossWidth/2 - 60, y: bossY + bossHeight, width: 120, height: 0, growing: true, type: 'wide' });
              }
            }
          }

          // Phase 3: fast movement + occasional blasts
          else if (bossAttackPhase === 3) {
            bossX += (bossSpeed * 3) * bossDirection * _dt;
            if (bossX <= 0) { bossX = 0; bossDirection = 1; }
            else if (bossX >= GAME_WIDTH - bossWidth) { bossX = GAME_WIDTH - bossWidth; bossDirection = -1; }
            bossShootTimer += _dt;
            if (bossShootTimer >= 120) {
              bossShootTimer = 0;
              bossBeams.push({ x: bossX + bossWidth/2 - 5, y: bossY + bossHeight, width: 10, height: 0, growing: true, type: 'narrow' });
            }
          }
        }
      }
    }

    // Update beams
    for (var i = bossBeams.length - 1; i >= 0; i--) {
      var beam = bossBeams[i];
      if (beam.type === 'narrow' || beam.type === 'wide') {
        if (beam.growing) {
          beam.height += 15 * _dt;
          if (beam.y + beam.height >= GAME_HEIGHT) { beam.growing = false; }
        } else {
          beam.height -= 10 * _dt;
          if (beam.height <= 0) { bossBeams.splice(i, 1); continue; }
        }
      }
      if (!bossDefeated && !isPlayerImmune &&
          playerX < beam.x + beam.width &&
          playerX + playerWidth > beam.x &&
          playerY < beam.y + beam.height &&
          playerY + playerHeight > beam.y) {
        hearts--;
        damageFlash = 1.0;
        safePlayAudio(badItemSound);
      }
    }
  }

  // Trigger defeat sequence
  if (bossActive && bossHealth <= 0 && !bossDefeated) {
    bossDefeated = true;
    bossDefeatTimer = bossDefeatDuration;
    bossBeams = [];
    bossStunned = false;
    bossStunTimer = 0;
    score += 100000;
    if (itemSpeed > 10) { itemSpeed = 15; }
  }

  // Defeat animation
  if (bossDefeated && bossDefeatTimer > 0) {
    bossDefeatTimer -= _dt;
    if (bossDefeatTimer > bossDefeatDuration / 2) {
      bossShakeAmount = 5;
    } else {
      bossY -= 8 * _dt;
      bossShakeAmount = 0;
    }
    if (bossDefeatTimer <= 0) {
      bossActive = false;
      bossDefeated = false;
      bossCountdownStarted = false;
      bossAttackPhase = 1;
      bossPhaseTimer = 0;
    }
  }

  // Spawn counter — accumulator instead of modulo so dt works correctly
  spawnCounter += _dt;
  if (spawnCounter >= 10) {
    spawnCounter = 0;
    resetItems();
  }

  requestAnimationFrame(update);
}

function toggleDevMode() {
  developerMode = !developerMode;
  var button = document.getElementById('devModeButton');
  if (developerMode) {
    button.innerText = 'DEV MODE: ON';
    button.classList.add('active');
    if (!bossCountdownStarted && !bossActive) {
      bossCountdownStarted = true;
      bossCountdownTimer = 10;
    }
  } else {
    button.innerText = 'DEV MODE: OFF';
    button.classList.remove('active');
  }
}

restartButton.addEventListener("click", function() {
  window.location.reload();
});

watchButton.addEventListener("click", function() {
  window.location.href = ("https://youtube.com/@bhaleyart");
});

canvas.addEventListener("mousemove", function(event) {
  if (!isMobile && !isGameOver && gameStarted) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = GAME_WIDTH / rect.width;
    var mouseX = (event.clientX - rect.left) * scaleX;
    playerX = mouseX - playerWidth / 2;
    playerX = Math.max(SCREEN_MARGIN_LEFT, Math.min(GAME_WIDTH - playerWidth - SCREEN_MARGIN_RIGHT, playerX));
  }
});

canvas.addEventListener("touchmove", function(event) {
  if (!isGameOver && gameStarted) {
    event.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var scaleX = GAME_WIDTH / rect.width;
    var touchX = (event.touches[0].clientX - rect.left) * scaleX;
    playerX = touchX - playerWidth / 2;
    playerX = Math.max(SCREEN_MARGIN_LEFT, Math.min(GAME_WIDTH - playerWidth - SCREEN_MARGIN_RIGHT, playerX));
    targetPlayerX = playerX;
  }
}, { passive: false });

setCanvasSize();

window.addEventListener("resize", function() {
  setCanvasSize();
});
