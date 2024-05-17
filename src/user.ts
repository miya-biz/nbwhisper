import Enumerable from 'linq';
import { UserState } from './userState';

// クライアント情報
// 複数タブ、ウィンドウごと(通信ごと)別に管理・公開する
export class Client {
  // 待機チャンネルクライアントId
  waiting_client_id = '';
  // 通話チャンネルクライアントId
  talking_client_id = '';
  // 通話チャンネルルーム名
  talking_room_name = '';
  // ユーザー名
  user_name = '';
  // 通話状態
  state: UserState = UserState.Standby;

  public update(client: Client) {
    this.waiting_client_id = client.waiting_client_id;
    this.talking_client_id = client.talking_client_id;
    this.talking_room_name = client.talking_room_name;
    this.user_name = client.user_name;
    this.state = client.state;
  }
}

// ユーザー管理情報
export class User {
  // 名前
  name = '';
  // 所有クライアント
  clients: Client[] = [];

  /** ローカルでのみ管理する項目 **/
  // 選択中か？
  is_selected = false;
  // 自身の招待を受けているか？
  is_invited = false;
  // 自身の通話に入っているか？
  is_joined = false;
  // ミュート中か？
  is_mute = false;
  // 画面共有中か？
  is_sharing_display = false;

  // 通話の招待可能か？
  public canInvite() {
    return this.getState() === UserState.Standby;
  }

  // 指定のストリームIdのユーザーか？
  public hasStream(id: string) {
    return Enumerable.from(this.clients)
      .where(c => c.talking_client_id === id)
      .any();
  }

  // 通話ルームに参加しているか？
  public isJoiningTalkingRoom(roomName: string) {
    return Enumerable.from(this.clients)
      .where(c => c.talking_room_name === roomName)
      .any();
  }

  // ステータスを取得する
  public getState() {
    let state: UserState = UserState.Standby;
    for (const client of this.clients) {
      if (client.state === UserState.Confirming) {
        if (state === UserState.Standby) {
          state = UserState.Confirming;
        }
      } else if (client.state === UserState.Invited) {
        if (state === UserState.Standby || state === UserState.Confirming) {
          state = UserState.Invited;
        }
      } else if (client.state === UserState.Calling) {
        if (
          state === UserState.Standby ||
          state === UserState.Invited ||
          state === UserState.Confirming
        ) {
          state = UserState.Calling;
        }
      } else if (client.state === UserState.Talking) {
        if (
          state === UserState.Standby ||
          state === UserState.Invited ||
          state === UserState.Confirming ||
          state === UserState.Calling
        ) {
          state = UserState.Talking;
        }
      }
    }
    return state;
  }
}

// 招待情報
export class Invitation {
  // 有効か？
  is_active = false;
  // ルーム名
  room_name = '';
  // 招待元ユーザー
  from_user_name = '';
  // 招待元ユーザークライアントId
  from_talking_client_id = '';
  // 招待ユーザー名
  target_user_names: string[] = [];
  // 参加済みユーザー名
  joined_user_names: string[] = [];
}
