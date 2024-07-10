import * as React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { User } from './user';
import { Signal } from '@lumino/signaling';
import { WaitingUserList } from './waitingUserList';
import Enumerable from 'linq';
import { RemoteMedia } from './remoteMedia';
import { UserState } from './userState';
import { IRemoteMediaMouse } from './iRemoteMediaMouse';

// 参加者リスト
export function TalkingUserList({
  users,
  onCancel
}: {
  users: User[];
  onCancel: (user: User) => void;
}): JSX.Element {
  const [hoveringIndex, setHoveringIndex] = React.useState(-1);
  const talkingUsers = Enumerable.from(users)
    .where(u => u.is_joined)
    .toArray();
  const callingUsers = Enumerable.from(users)
    .where(u => u.is_invited)
    .toArray();
  return (
    <div className="nbwhisper-talking-view-user-list-container nbwhisper-user-list-container">
      <ul>
        {talkingUsers.map((user, index) => {
          return (
            <li key={index}>
              {
                <div className="nbwhisper-user-list-item disabled">
                  <span className="nbwhisper-user-list-item-label">
                    {user.name}
                  </span>
                  <span className="nbwhisper-user-list-item-icons">
                    {user.is_mute && <div className="nbwhisper-mute-icon" />}
                    {user.is_sharing_display && (
                      <div className="nbwhisper-share-display-icon" />
                    )}
                  </span>
                </div>
              }
            </li>
          );
        })}
        {callingUsers.length > 0 && (
          <React.Fragment>
            <li
              key="calling-user-separator"
              className="nbwhisper-talking-view-user-list-separator"
            />
            <li
              key="calling-user-caption"
              className="nbwhisper-talking-view-user-list-inner-caption"
            >
              リクエスト済み({callingUsers.length})
            </li>
          </React.Fragment>
        )}
        {callingUsers.map((user, index) => {
          return (
            <li key={index}>
              {
                <div
                  className="nbwhisper-user-list-item disabled"
                  onMouseEnter={() => setHoveringIndex(index)}
                  onMouseLeave={() => setHoveringIndex(-1)}
                >
                  <span className="nbwhisper-user-list-item-label">
                    {user.name}
                  </span>
                  <span className="nbwhisper-talking-view-user-list-buttons">
                    {hoveringIndex === index && (
                      <div
                        className="nbwhisper-talking-view-user-list-cancel-button"
                        onClick={() => onCancel(callingUsers[index])}
                      >
                        取消
                      </div>
                    )}
                  </span>
                </div>
              }
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// 参加リクエストボタン
export function RequestJoiningButton({
  targetNumber,
  onClick
}: {
  targetNumber: number;
  onClick: () => void;
}): JSX.Element {
  return (
    <div
      className={`nbwhisper-talking-view-user-list-footer nbwhisper-button
                ${
                  targetNumber > 0
                    ? 'nbwhisper-button-normal'
                    : 'nbwhisper-button-disabled'
                }`}
      onClick={
        targetNumber > 0
          ? onClick
          : () => {
              /* do nothing */
            }
      }
    >
      <span>参加をリクエスト{targetNumber > 0 && `(${targetNumber})`}</span>
    </div>
  );
}

// 通話画面ウィジェット
export class TalkingViewWidget extends ReactWidget {
  private _isInnerVisible = false;
  private _isUserListVisible = true;
  private _userListPage = 0;

  private _users!: User[];
  private _ownUser!: User;
  private _remoteStreams: MediaStream[] = [];

  public onMinimizeTalkingView = new Signal<TalkingViewWidget, any>(this);
  public onSetMute = new Signal<TalkingViewWidget, boolean>(this);
  public onSetSharingDisplay = new Signal<TalkingViewWidget, boolean>(this);
  public onHungUp = new Signal<TalkingViewWidget, any>(this);
  public onResuestJoining = new Signal<TalkingViewWidget, User[]>(this);
  public onCancelRequest = new Signal<TalkingViewWidget, User>(this);
  public onRemoteMediaMouseMove = new Signal<
    TalkingViewWidget,
    IRemoteMediaMouse
  >(this);

  constructor(users: User[], ownUser: User, remoteStremas: MediaStream[]) {
    super();
    this._users = users;
    this._ownUser = ownUser;
    this._remoteStreams = remoteStremas;
  }

  public showWidget() {
    this._isInnerVisible = true;
    this.update();
  }

  public hideWidget() {
    this._isInnerVisible = false;
    this.update();
  }

  public changeUserListPage(page: number) {
    this._userListPage = page;
    this.update();
  }

  private _onSelectUser(user: User) {
    user.is_selected = !user.is_selected;
    this.update();
  }

  private _onCancelCallingUser(user: User) {
    this.onCancelRequest.emit(user);
  }

  private _minimizeTalkingView() {
    this.onMinimizeTalkingView.emit(null);
  }

  private _showUserList() {
    this._isUserListVisible = true;
    this.update();
  }

  private _hideUserList() {
    this._isUserListVisible = false;
    this.update();
  }

  private _changeUserListPage(page: number) {
    this._userListPage = page;
    this.update();
  }

  private _setMute(isOn: boolean) {
    this.onSetMute.emit(isOn);
  }

  private _setSharingDisplay(isOn: boolean) {
    this.onSetSharingDisplay.emit(isOn);
  }

  private _onHungUp() {
    this.onHungUp.emit(null);
  }

  private _requestJoining() {
    const users = Enumerable.from(this._users)
      .where(u => u.canInvite() && u.is_selected)
      .toArray();
    if (users.length > 0) {
      this.onResuestJoining.emit(users);
    }
  }

  private _onRemoteMediaMouseMove(mouse: IRemoteMediaMouse) {
    if (this.onRemoteMediaMouseMove === null) {
      return;
    }
    this.onRemoteMediaMouseMove.emit(mouse);
  }

  render(): JSX.Element {
    const isCalling = this._ownUser.getState() === UserState.Calling;
    return (
      <div
        className={`nbwhisper-talking-view ${
          this._isInnerVisible ? 'active' : 'leave'
        }`}
      >
        <div className="nbwhisper-talking-view-main">
          <div className="nbwhisper-talking-view-display-area">
            {isCalling ? (
              <div>
                <div className="nbwhisper-talking-view-info-text">
                  呼び出し中…
                </div>
                <div className="nbwhisper-talking-view-calling-members">
                  {Enumerable.from(this._users)
                    .where(u => u.is_invited)
                    .select(u => u.name)
                    .toArray()
                    .join(', ')}
                </div>
              </div>
            ) : (
              // 参加中かつ画面共有中のメンバーが存在していない場合表示
              !Enumerable.from(this._users)
                .where(u => u.is_joined && u.is_sharing_display)
                .any() && (
                <div className="nbwhisper-talking-view-info-text">
                  画面共有が開始されるとここに表示されます。
                </div>
              )
            )}
            <div id="nbwhisper-talking-view-video-container">
              {this._isInnerVisible &&
                this._remoteStreams.map(x => (
                  <RemoteMedia
                    key={x.id}
                    stream={x}
                    isDisplay={
                      Enumerable.from(this._users)
                        .where(u => u.hasStream(x.id))
                        .firstOrDefault()?.is_sharing_display ?? false
                    }
                    isMute={
                      Enumerable.from(this._users)
                        .where(u => u.hasStream(x.id))
                        .firstOrDefault()?.is_mute ?? false
                    }
                    onMouseMove={mouse => this._onRemoteMediaMouseMove(mouse)}
                  />
                ))}
            </div>
          </div>
          {Enumerable.from(this._users)
            .where(u => u.is_sharing_display)
            .any() && (
            <div className="nbwhisper-talking-view-display-name">
              {
                Enumerable.from(this._users)
                  .where(u => u.is_sharing_display)
                  .first().name
              }
              の画面
            </div>
          )}
          {!isCalling && (
            <div
              className={`nbwhisper-talking-view-user-list-area ${
                this._isUserListVisible ? 'active' : 'leave'
              }`}
            >
              {this._userListPage === 0 && (
                <React.Fragment>
                  <div className="nbwhisper-talking-view-user-list-header">
                    <div className="nbwhisper-talking-view-user-list-header-caption">
                      参加者
                    </div>
                    <div
                      className="nbwhisper-talking-view-user-list-header-close-button"
                      onClick={() => this._hideUserList()}
                    />
                  </div>
                  <TalkingUserList
                    users={this._users}
                    onCancel={user => this._onCancelCallingUser(user)}
                  />
                  <div className="nbwhisper-talking-view-user-list-footer">
                    <div
                      className="nbwhisper-button nbwhisper-button-normal nbwhisper-talking-view-user-list-add-member-button"
                      onClick={() => this._changeUserListPage(1)}
                    >
                      <div className="nbwhisper-talking-view-user-list-add-member-button-icon" />
                      <span>参加者を追加</span>
                    </div>
                  </div>
                </React.Fragment>
              )}
              {this._userListPage === 1 && (
                <React.Fragment>
                  <div className="nbwhisper-talking-view-user-list-header">
                    <div
                      className="nbwhisper-talking-view-user-list-header-back-button"
                      onClick={() => this._changeUserListPage(0)}
                    />
                    <div className="nbwhisper-talking-view-user-list-header-caption">
                      参加者を追加
                    </div>
                    <div
                      className="nbwhisper-talking-view-user-list-header-close-button"
                      onClick={() => this._hideUserList()}
                    />
                  </div>
                  <WaitingUserList
                    users={Enumerable.from(this._users)
                      .where(u => !u.is_invited && !u.is_joined)
                      .toArray()}
                    onSelect={user => this._onSelectUser(user)}
                    optionalClassName="nbwhisper-talking-view-user-list-container"
                  />
                  <RequestJoiningButton
                    targetNumber={Enumerable.from(this._users)
                      .where(u => u.canInvite() && u.is_selected)
                      .count()}
                    onClick={() => this._requestJoining()}
                  />
                </React.Fragment>
              )}
            </div>
          )}
        </div>
        <div className="nbwhisper-talking-view-footer">
          <div className="nbwhisper-talking-view-left-buttons">
            <div
              className={`nbwhisper-talking-view-button nbwhisper-talking-view-close-button ${
                isCalling && 'disabled'
              }`}
              onClick={() => this._minimizeTalkingView()}
              title="通話画面を隠す"
            />
          </div>
          <div className="nbwhisper-talking-view-center-buttons">
            {this._ownUser.is_mute ? (
              <div
                className="nbwhisper-talking-view-button nbwhisper-talking-view-mute-off-button"
                onClick={() => this._setMute(false)}
                title="マイクをオン"
              />
            ) : (
              <div
                className="nbwhisper-talking-view-button nbwhisper-talking-view-mute-on-button"
                onClick={() => this._setMute(true)}
                title="マイクをオフ"
              />
            )}
            {this._ownUser.is_sharing_display ? (
              <div
                className={`nbwhisper-talking-view-button nbwhisper-talking-view-share-display-off-button ${
                  isCalling && 'disabled'
                }`}
                onClick={() => this._setSharingDisplay(false)}
                title="画面共有を終了"
              />
            ) : (
              <div
                className={`nbwhisper-talking-view-button nbwhisper-talking-view-share-display-on-button ${
                  isCalling && 'disabled'
                }`}
                onClick={() => this._setSharingDisplay(true)}
                title="画面を共有"
              />
            )}
            <div
              className="nbwhisper-talking-view-button nbwhisper-talking-view-hung-up-button"
              onClick={() => this._onHungUp()}
              title="通話から退出"
            />
          </div>
          <div className="nbwhisper-talking-view-right-buttons">
            {this._isUserListVisible ? (
              <div
                className={`nbwhisper-talking-view-button nbwhisper-talking-view-hide-members-button ${
                  isCalling && 'disabled'
                }`}
                onClick={() => this._hideUserList()}
                title="参加者を表示"
              />
            ) : (
              <div
                className={`nbwhisper-talking-view-button nbwhisper-talking-view-show-members-button ${
                  isCalling && 'disabled'
                }`}
                onClick={() => this._showUserList()}
                title="参加者を隠す"
              />
            )}
          </div>
        </div>
      </div>
    );
  }
}
