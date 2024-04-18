import * as React from 'react';
import { Client, User } from './user';
import { ReactWidget } from '@jupyterlab/apputils';
import { Signal } from '@lumino/signaling';
import { WaitingUserList } from './waitingUserList';
import Draggable from 'react-draggable';
import Enumerable from 'linq';
import { UserState } from './userState';

// 待機ユーザーリスト表示ボタン
export function WaitingUserListButton({
    isListVisible,
    isNotebook7,
    onClick
} : {
    isListVisible : boolean,
    isNotebook7 : boolean,
    onClick : () => void,
}) : JSX.Element {
    return (
        <div 
            className={`nbwhisper-waiting-user-list-button 
                ${
                    isListVisible ? 
                        "nbwhisper-waiting-user-list-button-close" : 
                        "nbwhisper-waiting-user-list-button-open"
                }
                ${
                    isNotebook7 && 'notebook7'
                }
                `}
            onClick={onClick}
        >
        </div>
    );
}

// 通話リクエストボタン
export function RequestTalkingButton({
    targetNumber,
    onClick
} : {
    targetNumber: number,
    onClick : () => void,
}) : JSX.Element {
    return (
        <div 
            className={`nbwhisper-request-talking-button nbwhisper-button
                ${
                    targetNumber > 0 ? 
                        "nbwhisper-button-normal" : 
                        "nbwhisper-button-disabled"
                }`}
            onClick={targetNumber > 0 ? onClick : () => {}}
        >
            <span>通話をリクエスト{ targetNumber > 0 && `(${targetNumber})`}</span>
        </div>
    );
}

// 待機ユーザーリストウィジェット
export class WaitingUserListWidget extends ReactWidget {
    
    private _isListVisible = false;
    private _users : User[];
    private _ownUser : User;
    private _ownClient : Client;
    private _isNotebook7 : boolean;

    public onSetVisibleList = new Signal<WaitingUserListWidget, boolean>(this);
    public onRequestTalking = new Signal<WaitingUserListWidget, User[]>(this);

    constructor(users : User[], ownUser : User, ownClient : Client, isNotebook7 : boolean) {
        super();
        this._users = users;
        this._ownUser = ownUser;
        this._ownClient = ownClient;
        this._isNotebook7 = isNotebook7;
    }

    setListVisible(value : boolean) {
        this.onSetVisibleList.emit(value);
        this._isListVisible = value;
        this.update();
    }

    _requestTalking() {
        let users = Enumerable.from(this._users).where(u => u.canInvite() && u.is_selected).toArray();
        if(users.length > 0) {
            this.onRequestTalking.emit(users);
        }
    }

    _onSelectUser(user : User) {
        user.is_selected = !user.is_selected;
        this.update();
    }

    _isVisibleOtherClientsTalking() {
        // 自クライアントは呼び出し中/通話中でなく、自身の他のクライアントが呼び出し中/通話中のとき、
        // 「他タブ・ウィンドウで通話中」テキストを表示して、ボタンとリストを非表示にする。
        if(this._ownClient.state != UserState.Talking && this._ownClient.state != UserState.Calling) {
            let userState = this._ownUser.getState();
            return userState == UserState.Talking || userState == UserState.Calling;
        }
        return false;
    }

    render(): JSX.Element {
        return (
            <React.Fragment>
                <div className={`nbwhisper-waiting-user-list-widget ${this._isNotebook7 && 'notebook7'}`} hidden={this._isVisibleOtherClientsTalking()}>
                    <Draggable>
                        <div>
                            <WaitingUserListButton 
                                isListVisible={this._isListVisible}
                                isNotebook7={this._isNotebook7}
                                onClick={() => this.setListVisible(!this._isListVisible)}
                            />
                            { 
                                this._isListVisible && 
                                <div className={`nbwhisper-waiting-user-list-dialog ${this._isNotebook7 && 'notebook7'}`}>
                                    <WaitingUserList 
                                        users={this._users}
                                        onSelect={(user) => this._onSelectUser(user)}
                                        optionalClassName='nbwhisper-waiting-user-list-container'
                                    />
                                    <RequestTalkingButton
                                        targetNumber={Enumerable.from(this._users).where(u => u.canInvite() && u.is_selected).count()}
                                        onClick={() => this._requestTalking()}
                                    />
                                </div>
                            }
                        </div>
                    </Draggable>
                </div>
                {
                    this._isVisibleOtherClientsTalking() &&
                    <div className={`nbwhisper-waiting-user-list-hidden-text ${this._isNotebook7 && 'notebook7'}`} >
                        他タブ・ウィンドウで通話中
                    </div>
                }
            </React.Fragment>
        );
    }
}