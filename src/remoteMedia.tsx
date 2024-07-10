import React from 'react';
import { IRemoteMediaMouse } from './iRemoteMediaMouse';
import useThrottle from './useThrottle';

// リモートメディア(音声/動画)
export function RemoteMedia({
  stream,
  isDisplay,
  isMute,
  onMouseMove
}: {
  stream: MediaStream;
  isDisplay: boolean;
  isMute: boolean;
  onMouseMove?: (mouse: IRemoteMediaMouse) => void;
}): JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (onMouseMove === undefined || !isDisplay || videoRef.current === null) {
      return;
    }
    const videoViewRect = videoRef.current.getBoundingClientRect();
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    if (
      videoWidth <= 0 ||
      videoHeight <= 0 ||
      videoViewRect.width <= 0 ||
      videoViewRect.height <= 0
    ) {
      return;
    }
    const mousex = e.clientX - videoViewRect.left;
    const mousey = e.clientY - videoViewRect.top;
    console.log('mouse = ' + mousex + ',' + mousey);
    console.log('video = ' + videoWidth + ' x ' + videoHeight);
    // マウス位置を、共有画面上での位置に換算する
    const viewScale = Math.min(
      videoViewRect.width / videoWidth,
      videoViewRect.height / videoHeight
    );
    const offsetx = (videoViewRect.width - videoWidth * viewScale) * 0.5;
    const offsety = (videoViewRect.height - videoHeight * viewScale) * 0.5;
    const posx = (mousex - offsetx) / viewScale;
    const posy = (mousey - offsety) / viewScale;
    console.log('mouse on video = ' + posx + ',' + posy);
    onMouseMove({
      x: posx,
      y: posy,
      videoWidth: videoWidth,
      videoHeight: videoHeight
    });
  };

  // 1秒に1回実行する
  const throttledMouseMove = useThrottle(handleMouseMove, 1000);

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
      onMouseMove={throttledMouseMove}
      ref={videoRef}
    />
  );
}
