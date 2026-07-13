/**
 * =====================================================================
 * セッション情報管理システム (Session Manager)
 * 
 * 目的:
 * ゲームプレイ中の現在の状態（スコア、コンボ、経過時間、進行状況）を保持し、
 * 定期的またはイベント発生時にブラウザへ自動保存(Auto-Save)を行います。
 * 
 * 特徴:
 * - 状態を保持する「メモリ上の辞書」としての役割のみを持つ。
 * - どこかの機能（UIやゲームループ）を直接覗き見せず、通知されたイベントから情報を更新する。
 * - ブラウザの localStorage を利用して、タブを閉じても復元可能な状態にする。
 * =====================================================================
 */

const SessionManager = {
    // 現在のセッションデータ
    data: {
        sessionId: null,
        startTime: null,
        score: 0,
        combo: 0,
        lastCheckpoint: 'root'
    },

    /**
     * 【初期化】
     */
    init: function() {
        // [受信] ゲームが開始されたらセッションを開始
        EventBus.on('GAME_STARTED', (payload) => this.startSession(payload));

        // [受信] ゲーム中のステータス（スコアなど）が更新されたら記録
        EventBus.on('GAME_STATUS_UPDATED', (payload) => this.updateSession(payload));

        // [受信] 明示的にセーブが要求された時
        EventBus.on('REQUEST_SAVE_SESSION', () => this.saveToStorage());
    },

    /**
     * 【処理1: セッション開始】
     * @param {Object} payload - ゲーム開始情報
     */
    startSession: function(payload) {
        this.data = {
            sessionId: 'sess-' + Date.now(),
            startTime: Date.now(),
            score: 0,
            combo: 0,
            lastCheckpoint: 'root'
        };
        console.log("[SessionManager] 新規セッション開始:", this.data.sessionId);
    },

    /**
     * 【処理2: セッションの更新】
     * 外部（Unit Bなど）から送られてくる情報をマージして保持します。
     * @param {Object} updatePayload - 更新データ
     */
    updateSession: function(updatePayload) {
        // 受け取ったデータを既存データに上書き反映
        Object.assign(this.data, updatePayload);
        
        // （任意）一定の条件で自動保存を実行
        this.saveToStorage();
    },

    /**
     * 【処理3: 保存 (Persistence)】
     * メモリ上のデータを永続ストレージ(localStorage)へ書き出します。
     */
    saveToStorage: function() {
        try {
            const jsonString = JSON.stringify(this.data);
            localStorage.setItem('game_session_save', jsonString);
            
            // [送信] 保存完了を通知（UIなどが「セーブしました」と表示するため）
            EventBus.emit('SESSION_SAVED', { timestamp: Date.now() });
        } catch (e) {
            console.error("[SessionManager] セーブ失敗:", e);
        }
    },

    /**
     * 【処理4: 復元 (Load)】
     * ブラウザを再読み込みした時などに、前回の続きから開始します。
     */
    loadFromStorage: function() {
        const saved = localStorage.getItem('game_session_save');
        if (saved) {
            this.data = JSON.parse(saved);
            
            // [送信] ロード完了を通知
            EventBus.emit('SESSION_LOADED', { data: this.data });
            console.log("[SessionManager] 以前のセッションを復元しました。");
            return true;
        }
        return false;
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
SessionManager.init();

// 2. ゲーム開始時に初期化
EventBus.emit('GAME_STARTED', {});

// 3. プレイ中にスコアが更新されたら自動的に飛んでくる
// (Unit Bが EventBus.emit('GAME_STATUS_UPDATED', ...) すると自動でここが動く)

// 4. 強制的にセーブしたいボタン（UI）が押された時
function onManualSaveClick() {
    EventBus.emit('REQUEST_SAVE_SESSION');
}

// 5. ロード処理（起動時の判定などで使用）
function onGameLoad() {
    if(SessionManager.loadFromStorage()) {
        // ロード成功後の処理
    }
}
*/
```

これで、ゲームの起動、終了、そしてプレイ中の状態保存という「ライフサイクル全体」を管理するユニット群が揃いました。

これで一通りの主要な機能（A, B, Cユニット＋管理系システム）が完成しました。これらのコードを適切に組み合わせれば、強固な基盤を持つファイル整理ゲームが構築できます。

何か追加の実装や、コードの修正・統合に関する相談はありますか？それとも、これでプロジェクトの基盤構築は完了でしょうか？