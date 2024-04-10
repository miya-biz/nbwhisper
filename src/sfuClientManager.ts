import { requestAPI } from './handler';
import Sora from 'sora-js-sdk';

// イベントの種類
export class SfuClientEvent {
    // 待機チャンネルにプッシュがあった
    static readonly PushFromWaiting = "PushFromWaiting";
    // 待機チャンネルに参加があった
    static readonly ClientJoinWaiting = "ClientJoinWaiting";
    // 待機チャンネルから抜けた
    static readonly ClientLeaveFromWaiting = "ClientLeaveFromWaiting";
    // 通話チャンネルのストリームが届いた
    static readonly TrackStreamOnTalking = "TrackStreamOnTalking";
    // 通話チャンネルのストリームがなくなった
    static readonly RemoveStreamOnTalking = "RemoveStreamOnTalking";
    // 通話チャンネルから抜けた
    static readonly ClientLeaveFromTalking = "ClientLeaveFromTalking"
}

export class SfuClientManager {
    private debug = false;

    private sora;
    private channelIdPrefix : string;
    private channelIdSuffix : string;
    private apiKey : string;

    private waitingChannel : PushChannelClient | null = null;
    private talkingChannel : TalkChannelClient | null = null;

    private events : { [event : string] : (data : any) => void } = {};

    constructor(
        signalingUrl : string,
        channelIdPrefix : string,
        channelIdSuffix : string,
        apiKey : string
    ) {
        let signalingUrls = signalingUrl != null ? signalingUrl.split(',') : [];
        this.sora = Sora.connection(signalingUrls, this.debug);
        this.channelIdPrefix = channelIdPrefix;
        this.channelIdSuffix = channelIdSuffix;
        this.apiKey = apiKey;        
    }

    // イベントの登録
    public on(event : string, callback : (data : any) => void) {
        this.events[event] = callback;
    }

    sendEvent(event : string, data : any) {
        if(event in this.events) {
            this.events[event](data);
        }
    }

    // 待機チャンネルに接続してクライアントIdを返す
    async connectToWaitingChannel() {
        // チャンネル名生成
        let channelId = `${this.channelIdPrefix}waiting${this.channelIdSuffix}`
        // アクセストークンを得る
        let response = await requestAPI<any>(`create-access-token?api_key=${this.apiKey}&channel_id=${channelId}`)
        if(response.status == 200) {
            let responseObj = JSON.parse(response.text)
            let accessToken = responseObj.access_token;
            this.waitingChannel = new PushChannelClient(
                this.sora, 
                { "access_token": accessToken }, 
                channelId,
                this.apiKey,
                (data) => this.onPushedWaitingChannel(data),
                (clientId) => this.onClientJoinWaitingChannel(clientId),
                (clientId) => this.onClientLeftWaitingChannel(clientId)
            );
            // 接続する
            return await this.waitingChannel.connect() ?? "";
        } else {
            return "";
        }
    }

    // 待機チャンネルにPushを送る
    async sendPushToWaitingChannel(data : object) {
        if(this.waitingChannel == null) return false;
        return await this.waitingChannel.sendPush(data);
    }

    onPushedWaitingChannel(data : object) {
        this.sendEvent(SfuClientEvent.PushFromWaiting, data);
    }

    onClientJoinWaitingChannel(cliendId : string) {
        this.sendEvent(SfuClientEvent.ClientJoinWaiting, cliendId);
    }

    onClientLeftWaitingChannel(clientId : string) {
        this.sendEvent(SfuClientEvent.ClientLeaveFromWaiting, clientId);
    }

    async connectToTalkingChannel(roomName : string, localStream : MediaStream) {
        // チャンネル名生成
        let channelId = `${this.channelIdPrefix}${roomName}${this.channelIdSuffix}`
        // アクセストークンを得る
        let response = await requestAPI<any>(`create-access-token?api_key=${this.apiKey}&channel_id=${channelId}`)
        if(response.status == 200) {
            let responseObj = JSON.parse(response.text)
            let accessToken = responseObj.access_token;
            this.talkingChannel = new TalkChannelClient(
                this.sora, 
                { "access_token": accessToken }, 
                channelId,
                (stream) => this.onTrackStreamTalkingChannel(stream),
                (stream) => this.onRemoveStreamTalkingChannel(stream),
                (clientId) => this.onClientLeftTalkingChannel(clientId)
            );
            // 接続する
            return await this.talkingChannel.connect(localStream) ?? "";
        } else {
            return "";
        }
    }

    async replaceTalkingChannelVideoTrack(track : MediaStreamTrack) {
        if(this.talkingChannel == null) return false;
        return await this.talkingChannel.replaceVideoTrack(track);
    }

    async disconnectFromTalkingChannel() {
        if(this.talkingChannel == null) return;
        await this.talkingChannel.disconnect();
    }

    onTrackStreamTalkingChannel(stream : MediaStream) {
        this.sendEvent(SfuClientEvent.TrackStreamOnTalking, stream);
    }

    onRemoveStreamTalkingChannel(stream : MediaStream) {
        this.sendEvent(SfuClientEvent.RemoveStreamOnTalking, stream);
    }

    onClientLeftTalkingChannel(clientId : string) {
        this.sendEvent(SfuClientEvent.ClientLeaveFromTalking, clientId);
    }
}

// Push用チャンネルクライアント
class PushChannelClient {
    private sora;
    private connection! : any;
    private metadata : object;
    private channelId : string;
    private apiKey : string;
    private onPushed! : (data : object) => void;
    private onClientJoined : (clientId : string) => void;
    private onClientLeft! : (cliendId : string) => void;

    constructor(
        sora : any,
        metadata : object,
        channelId : string,
        apiKey : string,
        onPushed : (data : object) => void,
        onClientJoined : (clientId : string) => void,
        onClientLeft : (cliendId : string) => void
    ) {
        this.sora = sora;
        this.metadata = metadata;
        this.channelId = channelId;
        this.connection = this.sora.recvonly(this.channelId, this.metadata);
        this.apiKey = apiKey;
        this.onPushed = onPushed;
        this.onClientJoined = onClientJoined;
        this.onClientLeft = onClientLeft;

        this.connection.on("notify", this.onNotify.bind(this));
        this.connection.on("push", this.onPush.bind(this));
    }

    async connect() {
        await this.connection.connect();
        return this.connection.clientId;
    }

    async disconnect() {
        await this.connection.disconnect();
    }

    async sendPush(data : object) {
        let text = JSON.stringify(data);
        let response = await requestAPI<any>(`push-channel?api_key=${this.apiKey}&channel_id=${this.channelId}&data=${text}`);
        return response.status == 200;
    }

    onNotify(e : any) {
        console.log(e)
        if(e.event_type == "connection.created") {
            if(e.client_id == this.connection.clientId) {
                // 自身の接続完了
                console.log("waiting room is connected.");
            } else {
                // 新規メンバーの接続完了
                this.onClientJoined(e.client_id);
            }
        } else if(e.event_type == "connection.destroyed") {
            // メンバーが抜けた
            this.onClientLeft(e.client_id);
        }
    }

    onPush(e : any) {
        this.onPushed(e.data);
    }
}

// 通話用チャンネルクライアント
class TalkChannelClient {
    private sora;
    private connection! : any;
    private metadata : object;
    private channelId : string;
    private onStreamTracked! : (stream : MediaStream) => void;
    private onStreamRemoved! : (stream : MediaStream) => void;
    private onClientLeft! : (cliendId : string) => void;

    constructor(
        sora : any,
        metadata : object,
        channelId : string,
        onStreamTracked : (stream : MediaStream) => void,
        onStreamRemoved : (stream : MediaStream) => void,
        onClientLeft : (cliendId : string) => void
    ) {
        this.sora = sora;
        this.metadata = metadata;
        this.channelId = channelId;
        this.connection = this.sora.sendrecv(this.channelId, this.metadata);
        this.onStreamTracked = onStreamTracked;
        this.onStreamRemoved = onStreamRemoved;
        this.onClientLeft = onClientLeft;

        this.connection.on("notify", this.onNotify.bind(this));
        this.connection.on("track", this.onTrack.bind(this));
        this.connection.on("removetrack", this.onRemovetrack.bind(this));
    }

    async connect(stream : MediaStream) {
        await this.connection.connect(stream);
        return this.connection.clientId;
    }

    async disconnect() {
        await this.connection.disconnect();
    }

    async replaceVideoTrack(track : MediaStreamTrack) {
        let stream = this.connection.stream;
        if(stream == null) return false;
        await this.connection.replaceVideoTrack(stream, track);
        return true;
    }

    onNotify(e : any) {
        console.log(e)
        if(e.event_type == "connection.created" && e.connection_id == this.connection.connectionId) {
            // 接続完了
            console.log("waiting room is connected.");
        } else if(e.event_type == "connection.destroyed") {
            // メンバーが抜けた
            console.log("disconnected member = " + e.client_id);
            this.onClientLeft(e.client_id);
        }
    }

    onTrack(e : any) {
        let stream = e.streams[0];
        this.onStreamTracked(stream);
    }

    onRemovetrack(e : any) {
        let stream = e.target as MediaStream;
        console.log("remove track = " + stream.id);
        this.onStreamRemoved(stream);
    }
}