import * as React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { User } from './user';

// 共有画面で他ユーザーがマウスを動かしたときに、共有元に対してカーソルを表示するウィジェット
export class RemoteMouseCursorWidget extends ReactWidget {
  private _ownUser: User;
  private _x = 0;
  private _y = 0;

  constructor(ownUser: User) {
    super();
    this._ownUser = ownUser;
  }

  public move(x: number, y: number) {
    this._x = x;
    this._y = y;
    this.update();
  }

  render(): JSX.Element {
    return (
      <React.Fragment>
        {this._ownUser.is_sharing_display && (
          <div
            style={{
              position: 'fixed',
              left: this._x,
              top: this._y,
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: 'orange',
              transform: 'translate(-50%, -50%)',
              zIndex: 10001,
              pointerEvents: 'none'
            }}
          />
        )}
      </React.Fragment>
    );
  }
}
