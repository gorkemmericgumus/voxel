let _audioCtx = null;

function getAudioContext() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

export function playFootstep(surface = 'grass') {}

export function playSprintStep(surface = 'grass') {}

export function playSneakStep(surface = 'grass') {}

export function playBlockBreak(blockId) {}

export function playBlockPlace(blockId) {}

export function playBlockHit(blockId) {}

export function playJump() {}

export function playLand(fallDistance = 0) {}

export function playSplash() {}

export function playUnderwaterAmbient() {}

export function stopUnderwaterAmbient() {}

export function playDayAmbient() {}

export function playNightAmbient() {}

export function updateAmbientMix(dayFactor) {}

export function playUIClick() {}

export function playInventoryOpen() {}

export function playInventoryClose() {}

export function playMusic(track) {}

export function stopMusic() {}

export function setMasterVolume(volume) {}
