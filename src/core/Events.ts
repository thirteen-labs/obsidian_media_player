export const AUDIO_EVENTS = {
  STATE: 'onState',
  PROGRESS: 'onProgress',
  ENDED: 'onEnded',
  ERROR: 'onError',
} as const;

export const MUSIC_EVENTS = {
  STATE: 'onState',
  PROGRESS: 'onProgress',
  TRACK_CHANGE: 'onTrackChange',
  QUEUE_CHANGE: 'onQueueChange',
  REMOTE_COMMAND: 'onRemoteCommand',
  ENDED: 'onEnded',
  ERROR: 'onError',
} as const;

export const VIDEO_EVENTS = {
  STATE: 'onState',
  PROGRESS: 'onProgress',
  ENDED: 'onEnded',
  ERROR: 'onError',
  BUFFERING: 'onBuffering',
} as const;
