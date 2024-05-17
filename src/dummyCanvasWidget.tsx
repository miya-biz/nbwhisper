import React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';

// 空の動画を生成するダミーのキャンバス
export class DummyCanvasWidget extends ReactWidget {
  private _canvasRef: React.RefObject<HTMLCanvasElement>;
  private _reqAmimation = 0;

  constructor() {
    super();
    this._canvasRef = React.createRef();
  }

  captureStream() {
    const canvas = this._canvasRef.current;
    if (canvas) {
      return canvas.captureStream(1);
    }
    return null;
  }

  startAnimation() {
    const draw = () => {
      const canvas = this._canvasRef.current;
      if (canvas !== null) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
      }
      this._reqAmimation = requestAnimationFrame(draw);
    };

    draw();
  }

  stopAnimation() {
    if (this._reqAmimation !== 0) {
      cancelAnimationFrame(this._reqAmimation);
    }
  }

  onAfterAttach(msg: any): void {
    super.onAfterAttach(msg);
    this.startAnimation();
  }

  onBeforeDetach(msg: any): void {
    super.onBeforeDetach(msg);
    this.stopAnimation();
  }

  render(): JSX.Element {
    return <canvas className="nbwhisper-dummy-canvas" ref={this._canvasRef} />;
  }
}
