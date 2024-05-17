import React from 'react';

// リモートメディア(音声/動画)
export function RemoteMedia({
  stream,
  isDisplay,
  isMute
}: {
  stream: MediaStream;
  isDisplay: boolean;
  isMute: boolean;
}): JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (stream === null) {
      return;
    }
    if (videoRef.current !== null) {
      console.log('set stream to video. stream id: ' + stream.id);
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      className={
        isDisplay
          ? 'nbwhisper-talking-view-display-video'
          : 'nbwhisper-talking-view-hidden-video'
      }
      playsInline={true}
      autoPlay={true}
      muted={isMute}
      ref={videoRef}
    />
  );
}
