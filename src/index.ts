import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { requestAPI } from './handler';
import { WaitingUserListWidget } from './waitingUserListWidget';
import { Widget } from '@lumino/widgets';
import { Client, User, Invitation } from './user';
import { UserState } from './userState';
import { TalkingViewWidget } from './talkingViewWidget';
import { DialogWidget } from './dialogWidget';
import Enumerable from 'linq';
import { MiniTalkingViewWidget } from './miniTalkingViewWidget';
import { SfuClientManager, SfuClientEvent } from './sfuClientManager';
import { generateUuid } from './uuid';
import { DummyCanvasWidget } from './dummyCanvasWidget';
import { RequestTalkingWidget } from './requestTalkingWidget';
import { Platform, PlatformType, getPlatform } from './platform';

async function getAudioStream(dummyCanvasWidget : DummyCanvasWidget) {
    const constraints = {
        "audio" : true
    };
    try {
        // オーディオ
        const audioStream = await navigator.mediaDevices.getUserMedia(constraints);
        const audioTrack = audioStream.getAudioTracks()[0];
        if(!audioTrack) return null;
        // ビデオ
        const videoStream = dummyCanvasWidget.captureStream();
        const videoTrack = videoStream?.getVideoTracks()[0];
        if(!videoTrack) return null;
        // 合成して返す
        return new MediaStream([videoTrack, audioTrack]);
    }
    catch(e) {
        console.error("getAudioStream error:");
        console.error(e);
        return null;
    }
}

async function getDisplayTrack(preferCurrentTab : boolean = false) {
    let option = {
        video : true,
        selfBrowserSurface: 'include',
        preferCurrentTab: preferCurrentTab   // trueにすると、Chromeでこのタブ「しか」選べなくなる
    };
    try {
        // ディスプレイ
        const displayStream = await navigator.mediaDevices.getDisplayMedia(option);
        if(!displayStream) return null;
        return displayStream.getVideoTracks()[0];
    }
    catch(e) {
        console.error("getDisplayTrack error:")
        console.error(e);
        return null;
    }
}

function getDummyCanvasTrack(dummyCanvasWidget : DummyCanvasWidget) {
    try {
        // ビデオ
        const videoStream = dummyCanvasWidget.captureStream();
        if(!videoStream) return null;
        // 合成して返す
        return videoStream.getVideoTracks()[0];
    }
    catch(e) {
        console.error("getDummyCanvasTrack error:");
        console.error(e);
        return null;
    }
}

function stopMediaStream(stream : MediaStream) {
    stream.getVideoTracks().forEach(t => t.stop());
    stream.getAudioTracks().forEach(t => t.stop());
}

// プッシュの種別
export class PushKind {
    // 初回コンタクト
    static readonly Contact = "Contact";
    // クライアント情報
    static readonly Client = "Client";
    // 招待
    static readonly Invite = "Invite"
    // 招待の拒絶
    static readonly RefuseInvite = "RefuseInvite";
    // 招待をキャンセル
    static readonly CancelInvite = "CancelInvite";
    // 画面共有切り替え
    static readonly ShareDisplay = "ShareDisplay";
    // ミュート切り替え
    static readonly Mute = "Mute";
}

// プッシュのパラメータ
interface PushData {
    kind : string;
}
interface ContactPushData extends PushData {
    client : Client;
    needs_response : boolean;
}
interface ClientPushData extends PushData {
    client : Client;
}
interface InvitePushData extends PushData {
    target : string[];
    user_name : string;
    room_name : string;
    talking_client_id : string;
    joining_users : string[];
}
interface RefuseInvitePushData extends PushData {
    target : string;
    user_name : string;
    room_name : string;
}
interface CancelInvitePushData extends PushData {
    target : string;
    user_name : string;
    room_name : string;
}
interface ShareDisplayPushData extends PushData {
    user_name : string;
    room_name : string;
    is_sharing_display : boolean;
}
interface MutePushData extends PushData {
    user_name : string;
    room_name : string;
    is_mute : boolean;
}

async function initialize(platform : Platform) {
    if(platform.type == PlatformType.JUPYTER_NOTEBOOK7_TREE) {
        // ツリーの場合は無効
        console.log("This is jupyter notebook tree. NBWhisper is disabled.");
        return;
    }

    // jupyter_notebook_config.pyから設定の読み込み
    let data = await requestAPI<any>('config');
    let username = data.username ?? "";
    let apiKey = data.api_key ?? "";
    let signalingUrls = data.signaling_url ?? "";
    let channelIdPrefix = data.channel_id_prefix ?? "";
    let channelIdSuffix = data.channel_id_suffix ?? ""; // Sora cloudでは "@プロジェクト名"
    let share_current_tab_only = data.share_current_tab_only ?? false;

    // 自身のクライアント情報
    let ownClient : Client = new Client();
    ownClient.user_name = username;
    console.log("user name == " + ownClient.user_name);
    //TEST 別ユーザー扱いにする
    // ownClient.user_name += generateUuid().substring(0, 8);

    // ローカルストリーム
    let localStream : MediaStream | null = null;

    // リモートストリーム
    let remoteStreams : MediaStream[] = [];

    // 自身のユーザー情報
    let ownUser : User = new User();
    ownUser.name = ownClient.user_name;
    ownUser.clients.push(ownClient);
    // 招待情報
    let invitation : Invitation = new Invitation();
    // ユーザーリスト
    let allUsers : User[] = [];
    // 離脱済みクライアントId
    let leftClientIds : string[] = [];

    // 待機ユーザーリストウィジェット
    const waitingUserListWidget = new WaitingUserListWidget(allUsers, ownUser, ownClient, platform.type != PlatformType.JUPYTER_LAB);
    Widget.attach(waitingUserListWidget, document.body);

    // ミニ通話画面ウィジェット
    const miniTalkingViewWidget = new MiniTalkingViewWidget(allUsers, ownUser, remoteStreams, platform.type != PlatformType.JUPYTER_LAB);
    Widget.attach(miniTalkingViewWidget, document.body);
    miniTalkingViewWidget.hide();

    // 通話画面ウィジェット
    const talkingViewWidget = new TalkingViewWidget(allUsers, ownUser, remoteStreams);
    Widget.attach(talkingViewWidget, document.body);

    // ダイアログウィジェット
    const dialogWidget = new DialogWidget();
    Widget.attach(dialogWidget, document.body);

    // 通話リクエスト通知ウィジェット
    const requestTalkingWidget = new RequestTalkingWidget(invitation);
    Widget.attach(requestTalkingWidget, document.body);

    // ダミーキャンバスウィジェット
    const dummyCanvasWidget = new DummyCanvasWidget();
    Widget.attach(dummyCanvasWidget, document.body);

    // ウィジェットの更新
    const updateWidgets = () => {
        waitingUserListWidget.update();
        requestTalkingWidget.update();
        miniTalkingViewWidget.update();
        talkingViewWidget.update();
    };

    // リモートストリーム追加
    const addRemoteStream = (stream : MediaStream) => {
        if(!Enumerable.from(remoteStreams).where(x => x.id == stream.id).any()) {
            console.log("add remote stream: " + stream.id);
            // Idが存在していない場合は追加
            remoteStreams.push(stream);
            return true;
        }
        return false;
    }

    // リモートストリームの存在確認
    const hasRemoteStream = (id : string) => {
        return Enumerable.from(remoteStreams).where(x => x.id == id).any();
    }

    // リモートストリームの削除
    const removeRemoteStream = (id : string) => {
        let removeIndexes : number[] = [];
        for(let i = remoteStreams.length - 1; i >= 0; --i) {
            if(remoteStreams[i].id == id) removeIndexes.push(i);
        }
        removeIndexes.forEach(i => remoteStreams.splice(i, 1));
        return removeIndexes.length > 0;
    }

    // リモートストリームの全削除
    const clearRemoteStreams = () => {
        let length = remoteStreams.length;
        for(let i = length - 1; i >= 0; --i) {
            remoteStreams.splice(i, 1);
        }
    }

    const showRequestTalkingDialog = async (users : User[]) => {
        let subBody = `${users.length}名に送信します :\n`;
        subBody += Enumerable.from(users).select(u => u.name).toArray().join(", ");
    
        return await dialogWidget.showAskDialog({
            body: "通話リクエストを送信しますか？",
            subBody1: subBody,
            subBody2: "",
            ok: "送信",
            cancel: "キャンセル"
        });
    };

    const showRequestJoiningDialog = async (users : User[]) => {
        let subBody = `${users.length}名に送信します :\n`;
        subBody += Enumerable.from(users).select(u => u.name).toArray().join(", ");
    
        return await dialogWidget.showAskDialog({
            body: "参加リクエストを送信しますか？",
            subBody1: subBody,
            subBody2: "",
            ok: "送信",
            cancel: "キャンセル"
        });
    };

    // クライアントマネージャー
    const sfuClientManager = new SfuClientManager(
        signalingUrls,
        channelIdPrefix,
        channelIdSuffix,
        apiKey
    );

    // コンタクトを送信
    const sendPushContact = async (client : Client, neesResponse : boolean) => {
        let pushData : ContactPushData = {
            kind : PushKind.Contact,
            client : client,
            needs_response : neesResponse
        };
        await sfuClientManager.sendPushToWaitingChannel(pushData);
    };

    // クライアント更新を送信
    const sendPushClient = async (client : Client) => {
        let pushData : ClientPushData = {
            kind : PushKind.Client,
            client : client
        };
        await sfuClientManager.sendPushToWaitingChannel(pushData);
    };

    // 招待を送信
    const sendPushInvite = async (target : string[], userName : string, roomName : string, talkingClientId : string, joiningUsers : string[]) => {
        let pushData : InvitePushData = {
            kind : PushKind.Invite,
            target : target,
            user_name : userName,
            room_name : roomName,
            talking_client_id : talkingClientId,
            joining_users : joiningUsers
        };
        await sfuClientManager.sendPushToWaitingChannel(pushData);
    };

    // 招待拒絶を送信
    const sendPushRefuseInvite = async (target : string, userName : string, roomName : string) => {
        let pushData : RefuseInvitePushData = {
            kind : PushKind.RefuseInvite,
            target : target,
            user_name : userName,
            room_name : roomName
        };
        await sfuClientManager.sendPushToWaitingChannel(pushData);
    };

    // 招待キャンセルを送信
    const sendPushCancelInvite = async (target : string, userName : string, roomName : string) => {
        let pushData : CancelInvitePushData = {
            kind : PushKind.CancelInvite,
            target : target,
            user_name : userName,
            room_name : roomName
        };
        await sfuClientManager.sendPushToWaitingChannel(pushData);
    };

    // 画面共有切り替えを送信
    const sendPushShareDisplay = async (userName : string, roomName : string, isSharingDisplay : boolean) => {
        let pushData : ShareDisplayPushData = {
            kind : PushKind.ShareDisplay,
            user_name : userName,
            room_name : roomName,
            is_sharing_display : isSharingDisplay
        };
        await sfuClientManager.sendPushToWaitingChannel(pushData);
    };
    
    // ミュート切り替えを送信
    const sendPushMute = async  (userName : string, roomName : string, isMute : boolean) => {
        let pushData : MutePushData = {
            kind : PushKind.Mute,
            user_name : userName,
            room_name : roomName,
            is_mute : isMute
        };
        await sfuClientManager.sendPushToWaitingChannel(pushData);
    };

    // 待機チャンネルに接続
    let waitingClientId = await sfuClientManager.connectToWaitingChannel();
    if(waitingClientId == "") {
        // jupyterの設定が失敗した場合はここでアラート
        alert("nbwhisperが起動できませんでした。設定を見直して再起動してください。");
        return;
    }
    console.log("connected to waiting channel, client id = " + waitingClientId);
    ownClient.waiting_client_id = waitingClientId;
    
    // 待機チャンネルにPushが送られた場合
    sfuClientManager.on(SfuClientEvent.PushFromWaiting, async (data : object) => {
        let pushData = data as PushData;
        console.log("on push: " + pushData.kind);
        if(pushData.kind == PushKind.Contact) {
            // 初回コンタクト
            let contactPushData = data as ContactPushData;
            let needsResponse = contactPushData.needs_response;
            let clientData = Object.assign(new Client(), contactPushData.client);

            if(clientData.waiting_client_id == ownClient.waiting_client_id) {
                // 同一クライアントの場合はスルー
                console.log("waiting client id: " + clientData.waiting_client_id + " is the same client.");
                return;
            }

            if(leftClientIds.includes(clientData.waiting_client_id)) {
                // 離脱済みのクライアント情報が遅れて届いた
                // この場合は無視する
                console.log("waiting client id: " + clientData.waiting_client_id + " is left.");
                leftClientIds = leftClientIds.filter(x => x != clientData.waiting_client_id);
                return;
            }

            if(clientData.user_name == ownUser.name) {
                // 自分の情報の更新
                console.log("waiting client id: " + clientData.waiting_client_id + " is mine. update own user.");
                if(!Enumerable.from(ownUser.clients).where(c => c.waiting_client_id == clientData.waiting_client_id).any()) {
                    // 自身のクライアントを追加
                    ownUser.clients.push(clientData);
                } else {
                    // 既存クライアントなのでスルー
                    return;
                }
            } else {
                // 他ユーザーの情報更新
                console.log("waiting client id: " + clientData.waiting_client_id + " is other's. update all users.");
                let targetUser = Enumerable.from(allUsers).where(u => u.name == clientData.user_name).firstOrDefault();
                if(targetUser) {
                    if(!Enumerable.from(targetUser.clients).where(c => c.waiting_client_id == clientData.waiting_client_id).any()) {
                        // ユーザーのクライアント追加
                        targetUser.clients.push(clientData);
                    } else {
                        // 既存クライアントなのでスルー
                        return;
                    }
                } else {
                    // 新ユーザーの追加
                    let newUser = new User();
                    newUser.name = clientData.user_name;
                    newUser.clients.push(clientData);
                    allUsers.push(newUser);
                }
            }

            // ウィジェット更新
            updateWidgets();

            if(needsResponse) {
                // 自身の情報を送り返す
                console.log("response my client.")
                await sendPushContact(ownClient, false);
                if(ownClient.state == UserState.Calling || ownClient.state == UserState.Talking) {
                    // ミュート、画面共有情報も新規追加したユーザーに送る必要がある
                    await sendPushMute(ownUser.name, ownClient.talking_room_name, ownUser.is_mute);
                    await sendPushShareDisplay(ownUser.name, ownClient.talking_room_name, ownUser.is_sharing_display);
                }
            }
        }
        else if(pushData.kind == PushKind.Client) {
            // クライアント情報
            let clientPushData = data as ClientPushData;
            let clientData = Object.assign(new Client(), clientPushData.client);
            
            if(clientData.waiting_client_id == ownClient.waiting_client_id) {
                // 同一クライアントの場合はスルー
                console.log("waiting client id: " + clientData.waiting_client_id + " is the same client.");
                return;
            }

            if(leftClientIds.includes(clientData.waiting_client_id)) {
                // 離脱済みのクライアント情報が遅れて届いた
                // この場合は無視する
                console.log("waiting client id: " + clientData.waiting_client_id + " is left.");
                leftClientIds = leftClientIds.filter(x => x != clientData.waiting_client_id);
                return;
            }
            
            if(clientData.user_name == ownUser.name) {
                // 自分の情報の更新
                console.log("waiting client id: " + clientData.waiting_client_id + " is mine. update own user.");
                let existedClient = Enumerable.from(ownUser.clients).where(c => c.waiting_client_id == clientData.waiting_client_id).firstOrDefault();
                if(existedClient) {
                    // 既存のクライアントの場合データ更新
                    existedClient.update(clientData);
                }
            } else {
                // 他ユーザーの情報更新
                console.log("waiting client id: " + clientData.waiting_client_id + " is other's. update all users.");
                let targetUser = Enumerable.from(allUsers).where(u => u.name == clientData.user_name).firstOrDefault();
                if(targetUser) {
                    let existedClient = Enumerable.from(targetUser.clients).where(c => c.waiting_client_id == clientData.waiting_client_id).firstOrDefault();
                    if(existedClient) {
                        // 既存のクライアントの場合データ更新
                        existedClient.update(clientData);
                    }
                    // このユーザーの通話チャンネルクライアントIdに該当するストリームが存在している場合、
                    // ユーザーを通話参加中にする
                    if(Enumerable.from(targetUser.clients).where(c => hasRemoteStream(c.talking_client_id)).any()) {
                        console.log(`[push] client id is joined.`);
                        targetUser.is_joined = true;
                        targetUser.is_invited = false;
                    }
                }
            }
            // ウィジェット更新
            updateWidgets();
        } else if(pushData.kind == PushKind.Invite) {
            // 招待
            let invitePushData = data as InvitePushData;
            if(invitePushData.target.includes(ownUser.name)) {
                // 自身が招待を受けた
                console.log("invited talking room: " + invitePushData.room_name);
                if(invitation.is_active) {
                    // もし招待済みだった場合はこれを拒絶する
                    console.log("You have joined talking room. Refuse this invitation.")
                    await sendPushRefuseInvite(invitation.from_user_name, ownUser.name, invitation.room_name);
                }
                // 招待情報を更新
                invitation.is_active = true;
                invitation.room_name = invitePushData.room_name;
                invitation.from_user_name = invitePushData.user_name;
                invitation.from_talking_client_id = invitePushData.talking_client_id;
                invitation.target_user_names = invitePushData.target;
                invitation.joined_user_names = invitePushData.joining_users;
                // -> 着信中
                ownClient.state = UserState.Invited;
                await sendPushClient(ownClient);
                // ウィジェット更新
                updateWidgets(); 
            } else {
                if(invitePushData.room_name == ownClient.talking_room_name) {
                    // 自身が参加中のルームへの招待だった
                    console.log("Other users are invited to my room: " + invitePushData.room_name);
                    allUsers.forEach(user => {
                        if(invitePushData.target.includes(user.name)) {
                            // このユーザーを招待対象にセット
                            user.is_invited = true;
                        }
                    });
                    // ウィジェット更新
                    updateWidgets(); 
                }
            }
        } else if(pushData.kind == PushKind.RefuseInvite) {
            // 招待の拒絶
            let refuseInvitePushData = data as RefuseInvitePushData;
            if(refuseInvitePushData.room_name == ownClient.talking_room_name) {
                // 該当のユーザーの招待フラグをOFFにする
                let targetUser = Enumerable.from(allUsers).where(u => u.name == refuseInvitePushData.user_name).firstOrDefault();
                if(targetUser) {
                    targetUser.is_invited = false;
                }
                if(ownClient.state == UserState.Calling && !Enumerable.from(allUsers).where(u => u.is_invited).any()) {
                    // 呼び出し中に招待中のユーザーがいなくなった場合は招待を抜ける
                    await hungUp();
                    // 通話画面を閉じる
                    talkingViewWidget.hideWidget();
                }
                // ウィジェット更新
                updateWidgets();
            }
        } else if(pushData.kind == PushKind.CancelInvite) {
            // 招待のキャンセル
            let cancelInvitePushData = data as CancelInvitePushData;
            if(invitation.is_active && cancelInvitePushData.room_name == invitation.room_name) {
                if(cancelInvitePushData.target == "" || cancelInvitePushData.target == ownUser.name) {
                    console.log("invitation for me is cancelled.");
                    // 全ユーザー対象、もしくは自身を対象とした招待のキャンセル
                    invitation.is_active = false;
                    // -> 待機中
                    ownClient.state = UserState.Standby;
                    await sendPushClient(ownClient);
                    // ウィジェット更新
                    updateWidgets(); 
                }
            } else if(cancelInvitePushData.room_name == ownClient.talking_room_name) {
                // 自身の参加するルームからの招待のキャンセル
                console.log("invitation of my room is cancelled.");
                allUsers.forEach(user => {
                    if(user.name == cancelInvitePushData.target) {
                        // ユーザーの招待を取り消す
                        user.is_invited = false;
                    }
                });
                // ウィジェット更新
                updateWidgets(); 
            }
        } else if(pushData.kind == PushKind.ShareDisplay) {
            // 画面の共有切り替え
            let shareDisplayPushData = data as ShareDisplayPushData;
            let user = Enumerable.from(allUsers).where(u => u.name == shareDisplayPushData.user_name).firstOrDefault();
            if(user) {
                // 更新
                user.is_sharing_display = shareDisplayPushData.is_sharing_display;
                if(shareDisplayPushData.room_name == ownClient.talking_room_name) {
                    if(
                        shareDisplayPushData.is_sharing_display && 
                        ownUser.is_sharing_display
                    ) {
                        // 同室かつ自分も相手も共有状態になった場合は、自分の共有を解除する
                        await finishSharingDisplay();
                    }
                    // ウィジェット更新
                    updateWidgets(); 
                }
            }
        } else if(pushData.kind == PushKind.Mute) {
            // ミュート切り替え
            let muteDisplayPushData = data as MutePushData;
            let user = Enumerable.from(allUsers).where(u => u.name == muteDisplayPushData.user_name).firstOrDefault();
            if(user) {
                // 更新
                user.is_mute = muteDisplayPushData.is_mute;
                if(muteDisplayPushData.room_name == ownClient.talking_room_name) {
                    // ウィジェット更新
                    updateWidgets();
                }
            }
        }
    });

    // 通話リクエスト通知ウィジェットで決定した場合
    requestTalkingWidget.onDesideRequest.connect(async (_, isOk) => {
        if(!invitation.is_active) {
            // 招待自体がない
            return;
        }

        let isAliveTalking = false;
        // 招待情報のルーム名に参加しているユーザーの存在を確認する
        let roomName = invitation.room_name;
        if(Enumerable.from(allUsers).where(u => u.isJoiningTalkingRoom(roomName)).any()) {
            isAliveTalking = true;
        }
        if(!isAliveTalking) {
            alert("通話が終了したため、この招待は無効になりました");
            // 招待を無効化
            invitation.is_active = false;
            // -> 待機中
            ownClient.state = UserState.Standby;
            await sendPushClient(ownClient);
            // ウィジェット更新
            updateWidgets();
            return;
        }

        if(isOk) {
            // 自身通話中は処理しない
            if(ownClient.state == UserState.Talking) return;
            // 他タブで通話中は開始できない
            let ownState = ownUser.getState();
            if(ownState == UserState.Calling || ownState == UserState.Talking) {
                alert("他のタブやウィンドウで通話中のため、新たに通話を開始することができません");
                return
            }
            // -> 通話中
            ownClient.state = UserState.Talking;
            await sendPushClient(ownClient);
            // オーディオストリーム取得
            localStream = await getAudioStream(dummyCanvasWidget);
            if(!localStream) {
                alert("マイクを使用することができないため、通話を開始することができませんでした");
                // -> 着信中 or 待機中
                ownClient.state = invitation.is_active ? UserState.Invited : UserState.Standby;
                await sendPushClient(ownClient);
                return;
            }
            console.log("local stream id = " + localStream.id);
            // 通話ビュー表示
            talkingViewWidget.showWidget();
            // ルームに入る
            let talkingClientId = await sfuClientManager.connectToTalkingChannel(invitation.room_name, localStream);
            if(talkingClientId == "") {
                alert("通話の開始に失敗しました");
                stopMediaStream(localStream);
                // 通話ビュー非表示
                talkingViewWidget.hideWidget();
                // -> 着信中 or 待機中
                ownClient.state = invitation.is_active ? UserState.Invited : UserState.Standby;
                await sendPushClient(ownClient);
                return;
            }
            console.log("connected to talking channel, client id = " + talkingClientId);
            ownClient.talking_client_id = talkingClientId;
            ownClient.talking_room_name = invitation.room_name;
            await sendPushClient(ownClient);
            // 待機ユーザーリスト非表示
            waitingUserListWidget.setListVisible(false);
            waitingUserListWidget.hide();
            // 招待を無効して、他のタブ・ウィンドウに対しても招待キャンセルを送信
            invitation.is_active = false;
            await sendPushCancelInvite(ownUser.name, invitation.from_user_name, invitation.room_name);
            // ウィジェット更新
            updateWidgets(); 
        } else {
            // 通話リクエストを拒絶
            await sendPushRefuseInvite(invitation.from_user_name, ownUser.name, invitation.room_name);
            // 招待を無効して、他のタブ・ウィンドウに対しても招待キャンセルを送信
            invitation.is_active = false;
            await sendPushCancelInvite(ownUser.name, invitation.from_user_name, invitation.room_name);
            // -> 待機中
            ownClient.state = UserState.Standby;
            await sendPushClient(ownClient);
            // ウィジェット更新
            updateWidgets(); 
        }
    });

    // 待機チャンネルにクライアントが参加した場合
    sfuClientManager.on(SfuClientEvent.ClientJoinWaiting, (clientId : string) => {
        console.log("add user clientId: " + clientId);
    });

    // 待機チャンネルからクライアントが離脱した場合
    sfuClientManager.on(SfuClientEvent.ClientLeaveFromWaiting, async (clientId : string) => {
        console.log("remove user clientId: " + clientId);
        let isRemoved = false;
        // 抜けたClientを削除していく
        // 自身
        let removeIndexes : number[] = [];
        for(let i = ownUser.clients.length - 1; i >= 0; --i) {
            if(ownUser.clients[i].waiting_client_id == clientId) removeIndexes.push(i);
        }
        if(removeIndexes.length > 0) {
            removeIndexes.forEach(i => ownUser.clients.splice(i, 1));
            isRemoved = true;
        }
        // 他ユーザー
        let removeUserIndexes : number[] = [];
        for(let j = allUsers.length - 1; j >= 0; --j) {
            let user = allUsers[j];
            removeIndexes = [];
            for(let i = user.clients.length - 1; i >= 0; --i) {
                if(user.clients[i].waiting_client_id == clientId) removeIndexes.push(i);
            }
            if(removeIndexes.length > 0) {
                isRemoved = true;
                removeIndexes.forEach(i => user.clients.splice(i, 1));
                if(user.clients.length <= 0) {
                    // Clientがなくなったユーザーを削除対象にする
                    removeUserIndexes.push(j);
                }
            }
        }
        // Clientを持たなくなったユーザーを削除する
        if(removeUserIndexes.length > 0) {
            removeUserIndexes.forEach(j => allUsers.splice(j, 1));
            isRemoved = true;
            if(ownClient.state == UserState.Calling && !Enumerable.from(allUsers).where(u => u.is_invited).any()) {
                // 呼び出し中に招待中のユーザーがいなくなった場合は招待を抜ける
                await hungUp();
                // 通話画面を閉じる
                talkingViewWidget.hideWidget();
            }
        }
        if(!isRemoved) {
            // 削除対象がない == ContactがPushされる前に消去された
            // このあとPushが届く可能性があるので、Idを離脱済みとして記録しておく
            console.log("save left client id: " + clientId);
            leftClientIds.push(clientId);
        }
        // ウィジェット更新
        updateWidgets();
    });

    // 通話チャンネルにストリームが届いた場合
    sfuClientManager.on(SfuClientEvent.TrackStreamOnTalking, async (stream : MediaStream) => {
        // ストリームidはクライアントIdと一致することを利用して、各ユーザーの参加状態を更新する
        // 各ユーザーのクライアントIdはPushで通知されるため、この段階ではまだ不明な場合もあるので
        // Push処理のほうでも参加状態更新を行う
        for(let user of allUsers) {
            if(Enumerable.from(user.clients).where(c => c.talking_client_id == stream.id).any()) {
                // このユーザーがストリームの発信元なので、参加者フラグを立て、招待中フラグを落とす
                console.log(`[track] client id = ${stream.id} is joined.`);
                user.is_joined = true;
                user.is_invited = false;
                break;
            }
        }
        addRemoteStream(stream);
        if(ownClient.state == UserState.Calling) {
            // -> 通話中
            ownClient.state = UserState.Talking;
            await sendPushClient(ownClient);
        }
        // ウィジェット更新
        updateWidgets();
    });

    // 通話チャンネルからストリームが削除された場合
    sfuClientManager.on(SfuClientEvent.RemoveStreamOnTalking, (stream : MediaStream) => {
        if(removeRemoteStream(stream.id)) {
            updateWidgets();
        }
    });

    // 通話チャンネルからクライアントが離脱した場合
    sfuClientManager.on(SfuClientEvent.ClientLeaveFromTalking, async (clientId) => {
        // 該当のクライアント情報から通話チャンネルIdを削除
        allUsers.forEach(user => {
            let targetClients = Enumerable.from(user.clients).where(c => c.talking_client_id == clientId).toArray();
            targetClients.forEach(client => client.talking_client_id = "");
            // 通話クライアントIdを持たなくなったユーザーについて、参加中フラグを落とす
            if(!Enumerable.from(user.clients).where(c => c.talking_client_id != "").any()) {
                user.is_joined = false;
                // ミュート、共有状態をリセット
                user.is_mute = false;
                user.is_sharing_display = false;
            }
        });
        if(ownClient.state == UserState.Talking && !Enumerable.from(allUsers).where(u => u.is_joined).any()) {
            // 通話中に自身以外の参加者がいなくなった場合は通話終了
            await hungUp();
            talkingViewWidget.hideWidget();
            miniTalkingViewWidget.hide();
            miniTalkingViewWidget.update();
            alert("通話が終了されました")
        }
        // ウィジェット更新
        updateWidgets();
    });

    // 待機ユーザーリストでリストの表示状態を切り替えた
    waitingUserListWidget.onSetVisibleList.connect(async (_, isVisible) => {
        if(isVisible) {
            // 初回のContact送信がうまくいかないことがあるので、再度送る
            await sendPushContact(ownClient, true);
        }
    });

    // 待機ユーザーリストで「通話をリクエスト」ボタンをクリックした
    waitingUserListWidget.onRequestTalking.connect(async (_, users) => {
        // -> 通話リクエスト確認中
        ownClient.state = UserState.Confirming;
        await sendPushClient(ownClient);
        if(await showRequestTalkingDialog(users)) {
            // 他タブで通話中は開始できない
            let ownState = ownUser.getState();
            if(ownState == UserState.Calling || ownState == UserState.Talking) {
                alert("他のタブやウィンドウで通話中のため、新たに通話を開始することができません");
                // -> 待機中
                ownClient.state = UserState.Standby;
                await sendPushClient(ownClient);
                return
            }
            // 現在の状態が招待可能なユーザーのみ対象とする
            users = Enumerable.from(users).where(u => u.canInvite()).toArray();
            if(users.length == 0) {
                alert("送信先が通話中のため、通話リクエストを送信できません");
                // -> 待機中
                ownClient.state = UserState.Standby;
                await sendPushClient(ownClient);
                return;
            }
            // オーディオストリーム取得
            let stream = await getAudioStream(dummyCanvasWidget);
            if(!stream) {
                alert("マイクを使用することができないため、通話を開始することができませんでした");
                // -> 待機中
                ownClient.state = UserState.Standby;
                await sendPushClient(ownClient);
                return;
            }
            localStream = stream;
            console.log("local stream id = " + localStream.id);
            // 通話ルーム名を作成して新規接続
            let roomName = "talking-" + generateUuid();
            let talkingClientId = await sfuClientManager.connectToTalkingChannel(roomName, localStream);
            if(talkingClientId == "") {
                alert("通話の開始に失敗しました");
                stopMediaStream(localStream);
                // -> 待機中
                ownClient.state = UserState.Standby;
                await sendPushClient(ownClient);
                return;
            }
            console.log("connected to talking channel, client id = " + talkingClientId);
            ownClient.talking_client_id = talkingClientId;
            ownClient.talking_room_name = roomName;
            // 選択ユーザーに招待中フラグを立て、選択を外す
            users.forEach(u => { 
                u.is_invited = true;
                u.is_selected = false;
            });
            // ウィジェット更新
            updateWidgets();
            // 通話ビュー表示
            talkingViewWidget.showWidget();
            // 招待を送る
            let userNames = Enumerable.from(users).select(u => u.name).toArray();
            await sendPushInvite(userNames, ownUser.name, roomName, talkingClientId, []);
            // 待機ユーザーリスト非表示
            waitingUserListWidget.setListVisible(false);
            waitingUserListWidget.hide();
            // -> 呼び出し中
            ownClient.state = UserState.Calling;
            await sendPushClient(ownClient);
        } else {
            // -> 待機中
            ownClient.state = UserState.Standby;
            await sendPushClient(ownClient);
        }
    });

    // 通話画面で「参加をリクエスト」ボタンをクリックした
    talkingViewWidget.onResuestJoining.connect(async (_, users) => {
        if(await showRequestJoiningDialog(users)) {
            // 現在の状態が招待可能なユーザーのみ対象とする
            users = Enumerable.from(users).where(u => u.canInvite()).toArray();
            if(users.length == 0) {
                alert("送信先が通話中のため参加リクエストを送信できません");
                return;
            }
            // 通話画面の参加者リストページをリセット
            talkingViewWidget.changeUserListPage(0);
            // 現在の参加者
            let joiningUsers = [ownUser.name];
            joiningUsers = joiningUsers.concat(Enumerable.from(allUsers).where(u => u.is_joined).select(u => u.name).toArray());
            // 選択ユーザーに招待中フラグを立て、選択を外す
            users.forEach(u => { 
                u.is_invited = true;
                u.is_selected = false;
            });
            // ウィジェット更新
            updateWidgets();
            // 招待を送る
            let userNames = Enumerable.from(users).select(u => u.name).toArray();
            await sendPushInvite(userNames, ownUser.name, ownClient.talking_room_name, ownClient.talking_client_id, joiningUsers);
        }
    });

    // 通話画面でリクエスト状態をキャンセルした
    talkingViewWidget.onCancelRequest.connect(async (_, user) => {
        // 招待中フラグを取り消す
        user.is_invited = false;
        // 招待キャンセルを送る
        await sendPushCancelInvite(user.name, ownUser.name, ownClient.talking_room_name);
    });

    // 画面共有を開始する
    const startSharingDisplay = async () => {
        // ディスプレイトラックを取得
        let displayTrack = await getDisplayTrack(share_current_tab_only);
        // 画面共有をブラウザ上でキャンセルした場合もここで返す
        if(!displayTrack) return false;
        // トラックを差し替える
        if(!await sfuClientManager.replaceTalkingChannelVideoTrack(displayTrack)) {
            alert("ディスプレイの共有に失敗しました");
            return false;
        }
        // 通話画面に変更を反映
        ownUser.is_sharing_display = true;
        // ウィジェット更新
        updateWidgets();
        // 画面共有を送信
        await sendPushShareDisplay(ownUser.name, ownClient.talking_room_name, true);
        return true;
    };

    // 画面共有をやめる
    const finishSharingDisplay = async () => {
        // ダミーキャンバストラックを取得
        let dummyCanvasTrack = getDummyCanvasTrack(dummyCanvasWidget);
        if(!dummyCanvasTrack) return;
        // トラックを差し替える
        if(!await sfuClientManager.replaceTalkingChannelVideoTrack(dummyCanvasTrack)) {
            alert("ディスプレイの共有停止に失敗しました");
            return false;
        }
        // 通話画面に変更を反映
        ownUser.is_sharing_display = false;
        // ウィジェット更新
        updateWidgets();
        // 画面共有取り消しを送信
        await sendPushShareDisplay(ownUser.name, ownClient.talking_room_name, false);
        return true;
    };

    // 通話画面で画面共有ボタンを押したときの処理
    talkingViewWidget.onSetSharingDisplay.connect(async (_, isOn) => {
        if(isOn) {
            // ミニ通話画面を表示、通話画面を最小化
            miniTalkingViewWidget.show();
            miniTalkingViewWidget.update();
            talkingViewWidget.hideWidget();
            if(!await startSharingDisplay()) {
                // 失敗した場合は通話画面を戻す
                talkingViewWidget.showWidget();
                miniTalkingViewWidget.hide();
                miniTalkingViewWidget.update();
            }
            // 画面更新
            talkingViewWidget.update();
            miniTalkingViewWidget.update();
        } else {
            await finishSharingDisplay();
        }
    });

    // ミニ通話画面で画面共有ボタンを押したときの処理
    miniTalkingViewWidget.onSetSharingDisplay.connect(async (_, isOn) => {
        if(isOn) {
            await startSharingDisplay();
        } else {
            await finishSharingDisplay();
        }
    });

    // ミュート設定
    const setMute = async (isOn : boolean) => {
        // 設定変更
        ownUser.is_mute = isOn;
        // ウィジェット更新
        updateWidgets();
        // 送信
        await sendPushMute(ownUser.name, ownClient.talking_room_name, isOn);
    };

    // 通話画面でミュート切り替え
    talkingViewWidget.onSetMute.connect(async (_, isOn) => {
        await setMute(isOn);
    });

    // ミニ通話画面でミュート切り替え
    miniTalkingViewWidget.onSetMute.connect(async (_, isOn) => {
        await setMute(isOn);
    });

    // 通話を切る処理
    const hungUp = async () => {
        // ローカルストリームを完全に閉じる
        if(localStream) {
            stopMediaStream(localStream);
        }
        // 切断する
        await sfuClientManager.disconnectFromTalkingChannel();
        if(Enumerable.from(allUsers).where(u => u.is_invited).any()) {
            // 招待しているユーザーがいる場合はキャンセルを送信する
            await sendPushCancelInvite("", ownUser.name, ownClient.talking_room_name);
        }
        allUsers.forEach(u => {
            // 招待中、参加中フラグを落とす
            u.is_invited = false;
            u.is_joined = false;
        });
        // 自身の通話クライアントIdを削除
        ownClient.talking_client_id = "";
        // ミュート、共有状態をリセット
        ownUser.is_mute = false;
        ownUser.is_sharing_display = false;
        // ルーム名削除
        ownClient.talking_room_name = "";
        // 全てのストリームを削除する
        clearRemoteStreams();
        // ウィジェット更新
        updateWidgets();
        // 待機ユーザーリスト表示
        waitingUserListWidget.show();
        // -> 待機中
        ownClient.state = UserState.Standby;
        await sendPushClient(ownClient);
    }

    // 通話画面で切断ボタンを押したときの処理
    talkingViewWidget.onHungUp.connect(async () => {
        await hungUp();
        // 通話画面を閉じる
        talkingViewWidget.hideWidget();
    });

    // ミニ通話画面で切断ボタンを押したときの処理
    miniTalkingViewWidget.onHungUp.connect(async () => {
        await hungUp();
        // ミニ通話画面を閉じる
        miniTalkingViewWidget.hide();
        miniTalkingViewWidget.update();
    });

    // 通話画面で最小化ボタンを押したときの処理
    talkingViewWidget.onMinimizeTalkingView.connect(() => {
        miniTalkingViewWidget.show();
        miniTalkingViewWidget.update();
        talkingViewWidget.hideWidget();
    });

    // ミニ通話画面で最大化ボタンを押したときの処理
    miniTalkingViewWidget.onMaximizeTalkingView.connect(async () => {
        if(ownUser.is_sharing_display) {
            // 共有中は最大化できないので、共有を停止するか聞く
            let reply = await dialogWidget.showAskDialog({
                body: `画面共有中は通話画面を開けません。画面共有を停止して通話画面を開きますか？`,
                subBody1: "",
                subBody2: "",
                ok: "OK",
                cancel: "キャンセル"
            });
            if(reply) {
                // ダイアログの確定前に、共有が切られている or 通話が終了している可能性があるのでチェック
                if(!ownUser.is_sharing_display || ownClient.talking_room_name == "") return;
                // 共有停止
                await finishSharingDisplay();
            } else {
                // キャンセル
                return;
            }
        }
        talkingViewWidget.showWidget();
        miniTalkingViewWidget.hide();
        miniTalkingViewWidget.update();
    });

    // 自身のユーザー情報を初回プッシュ
    await sendPushContact(ownClient, true);
}

function activate(app : JupyterFrontEnd) {
    console.log('JupyterLab extension nbwhisper is activated!');

    app.restored.then(async () => {
        let platform = await getPlatform(app);
        await initialize(platform);
    });
}

/**
 * Initialization data for the nbwhisper extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
    id: 'nbwhisper:plugin',
    description: 'A JupyterLab extension.',
    autoStart: true,
    activate: activate
};

export default plugin;
