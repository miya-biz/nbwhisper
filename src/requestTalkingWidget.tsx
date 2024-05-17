import * as React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { Invitation } from './user';
import { Signal } from '@lumino/signaling';

// 通話リクエストの通知
export class RequestTalkingWidget extends ReactWidget {
  private _invitation: Invitation;
  public onDesideRequest = new Signal<RequestTalkingWidget, boolean>(this);

  constructor(invitation: Invitation) {
    super();
    this._invitation = invitation;
  }

  private _desideRequest(isOk: boolean) {
    this.onDesideRequest.emit(isOk);
  }

  render(): JSX.Element {
    return (
      <div>
        {this._invitation.is_active && (
          <div className="nbwhisper-overlay">
            <div className="nbwhisper-dialog-base">
              <div className="nbwhisper-dialog-body">
                {`${this._invitation.from_user_name}から通話への参加リクエストが届きました。参加しますか？`}
              </div>
              <div className="nbwhisper-dialog-subbody">
                {`${this._invitation.target_user_names.length}名にリクエスト中 :\n`}
                {`${this._invitation.target_user_names.join(', ')}`}
              </div>
              {this._invitation.joined_user_names.length > 0 && (
                <div className="nbwhisper-dialog-subbody">
                  {`${this._invitation.joined_user_names.length}名が参加中です :\n`}
                  {`${this._invitation.joined_user_names.join(', ')}`}
                </div>
              )}
              <div className="nbwhisper-dialog-buttons">
                <div
                  className={'nbwhisper-button nbwhisper-button-not-join'}
                  onClick={() => this._desideRequest(false)}
                >
                  <span className="nbwhisper-button-not-join-icon" />
                  <span className="nbwhisper-button-not-join-text">
                    参加しない
                  </span>
                </div>
                <div
                  className={'nbwhisper-button nbwhisper-button-join'}
                  onClick={() => this._desideRequest(true)}
                >
                  <span className="nbwhisper-button-join-icon" />
                  <span className="nbwhisper-button-join-text">参加</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
