export interface SinkErrorDetails {
  media_code?: number | null;
  network_state?: number | null;
  ready_state?: number | null;
}

export interface SinkHandlers {
  onTime?: (t: number, d: number) => void;
  onDuration?: (d: number) => void;
  onEnded?: () => void;
  onError?: (
    message: string,
    code?: string | null,
    details?: SinkErrorDetails | null,
  ) => void;
  onPauseState?: (paused: boolean) => void;
}

export interface PlaybackSink {
  kind: "htmlAudio" | "companion";
  setHandlers: (h: SinkHandlers) => void;
  load: (url: string) => Promise<void>;
  pause: () => void;
  resume: () => void | Promise<void>;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (v0to1: number) => void;
  paused: boolean;
  currentTime: number;
  duration: number;
  playbackRate?: number;
}
