import * as React from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { Signal } from '@lumino/signaling';
import { User } from './user';
import { RemoteMedia } from './remoteMedia';
import Enumerable from 'linq';

// ミニ通話画面ウィジェット
export class MiniTalkingViewWidget extends ReactWidget {
    private _isDisplayAreaVisible = false;
    private _isVisibleDisplayButtons = false;

    public onMaximizeTalkingView = new Signal<MiniTalkingViewWidget, any>(this);
    public onSetMute = new Signal<MiniTalkingViewWidget, boolean>(this);
    public onSetSharingDisplay = new Signal<MiniTalkingViewWidget, boolean>(this);
    public onHungUp = new Signal<MiniTalkingViewWidget, any>(this); 

    private _users : User[];
    private _ownUser : User;
    private _remoteStreams : MediaStream[] = [];

    constructor(users : User[], ownUser : User, remoteStremas : MediaStream[]) {
        super();
        this._users = users;
        this._ownUser = ownUser;
        this._remoteStreams = remoteStremas;
    }

    private _maximizeTakingView() {
        this.onMaximizeTalkingView.emit(null);
    }

    private _openDisplayArea() {
        this._isDisplayAreaVisible = true;
        this.update();
    }

    private _closeDisplayArea() {
        this._isDisplayAreaVisible = false;
        this.update();
    }

    private _setMute(isOn : boolean) {
        this.onSetMute.emit(isOn);
    }

    private _setSharingDisplay(isOn : boolean) {
        this.onSetSharingDisplay.emit(isOn);
    }

    private _onHungUp() {
        this.onHungUp.emit(null);
    }

    private _setVisibleDisplayButtons(isVisible : boolean) {
        this._isVisibleDisplayButtons = isVisible;
        this.update();
    }
    
    render(): JSX.Element {
        return (
            <div>
                <div className='nbwhisper-mini-talking-view-button-palette'>
                    <div className='nbwhisper-mini-talking-view-buttons'>
                        {
                            this._ownUser.isMute() ?
                            <div className='nbwhisper-mini-talking-view-button nbwhisper-mini-talking-view-mute-off-button' 
                                onClick={() => this._setMute(false)} />
                            :
                            <div className='nbwhisper-mini-talking-view-button nbwhisper-mini-talking-view-mute-on-button' 
                                onClick={() => this._setMute(true)} />                            
                        }
                        {
                            this._ownUser.isSharingDisplay() &&
                            <div className='nbwhisper-mini-talking-view-button nbwhisper-mini-talking-view-display-off-button'
                                onClick={() => this._setSharingDisplay(false)} />
                        }
                        <div className='nbwhisper-mini-talking-view-button nbwhisper-mini-talking-view-hung-up-button' 
                            onClick={() => this._onHungUp()} />
                        <div className='nbwhisper-mini-talking-view-button empty' />
                        <div className='nbwhisper-mini-talking-view-button nbwhisper-mini-talking-view-maximize-button'
                            onClick={() => this._maximizeTakingView()} />
                    </div>
                </div>
                <div className='nbwhisper-mini-talking-view-display-palette'>
                    {
                        !this._isDisplayAreaVisible &&
                        <div className='nbwhisper-mini-talking-view-display-palette-opener' onClick={() => this._openDisplayArea()}/>
                    }
                    <div className={`nbwhisper-mini-talking-view-display-area ${this._isDisplayAreaVisible ? 'active' : 'leave'}`}
                        onMouseEnter={() => this._setVisibleDisplayButtons(true)}
                        onMouseLeave={() => this._setVisibleDisplayButtons(false)}>
                        <div>
                            {
                                this.isVisible &&
                                this._remoteStreams.map(x => (<RemoteMedia key={x.id} stream={x} isDisplay={
                                    Enumerable.from(this._users).where(u => u.isSharingDisplayStream(x.id)).any()
                                } />))
                            }
                        </div>
                        {
                            this._isVisibleDisplayButtons &&
                            <div className='nbwhisper-mini-talking-view-display-palette-buttons'>
                                <div className='nbwhisper-mini-talking-view-display-palette-button nbwhisper-mini-talking-view-display-palette-maximize-button'
                                    onClick={() => this._maximizeTakingView()} />
                                <div className='nbwhisper-mini-talking-view-display-palette-button nbwhisper-mini-talking-view-display-palette-close-button'
                                    onClick={() => this._closeDisplayArea()} />
                            </div>
                        }
                    </div>
                </div>
            </div>
        );
    }
}