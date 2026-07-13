/**
 * =====================================================================
 * Action管理システム (Unit A: Core Logic Unit の一部)
 * 
 * 目的:
 * プレイヤーの操作（移動、削除など）を「予定」として蓄積・管理します。
 * 実ファイル操作を避けるための最重要モジュールです。
 * 
 * 特徴:
 * - 受け取った操作指示からUUIDを持つActionデータを生成し、キュー(配列)に保存します。
 * - Undo（取り消し）や Redo（やり直し）のロジックを担当します。
 * - 状態が変化するたびに、EventBus経由でUIやマップへ通知を送ります。
 * =====================================================================
 */

/**
 * ID生成ユーティリティ
 * 各Actionを一意に識別するためのIDを発行します。
 * （ブラウザの標準機能があればそれを使い、なければ乱数で生成します）
 */
function generateActionID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // randomUUIDが使えない環境用の代替処理
    return 'action-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
}

const ActionManager = {
    // 整理予定のリスト（これから実行される操作の順番）
    actionQueue: [],
    
    // 取り消し（Undo）した操作を一時的に保存するリスト（Redo用）
    undoStack: [],

    /**
     * 【初期化】
     * 自分が対応すべきイベントをEventBusに登録します。
     */
    init: function() {
        // [受信] プレイヤーが何か操作を決定した時（例：移動ボタンを押した）
        EventBus.on('USER_INTENT_ACTION', (payload) => this.addAction(payload));

        // [受信] プレイヤーが「元に戻す」ボタンを押した時
        EventBus.on('REQUEST_UNDO', () => this.undoAction());

        // [受信] プレイヤーが「やり直す」ボタンを押した時
        EventBus.on('REQUEST_REDO', () => this.redoAction());

        // [受信] Result.jsonを作るために現在のリストが欲しいと呼ばれた時
        // （ JsonManager からの依頼などを想定 ）
        EventBus.on('REQUEST_ACTION_LIST', () => this.provideActionList());
    },

    /**
     * 【処理1: 新しい予定の追加】
     * @param {Object} payload - { type: 'MOVE'|'DELETE', targetFileId: 'ID', destinationId?: 'ID' }
     */
    addAction: function(payload) {
        // 万が一、必須データが足りない場合は無視する（エラー防止）
        if (!payload.type || !payload.targetFileId) {
            console.warn("[ActionManager] 必要なデータが不足しているため、Actionを追加できません。");
            return;
        }

        // 新しい予定データを作成
        const newAction = {
            actionId: generateActionID(),
            type: payload.type,                     // 操作の種類 (MOVE, DELETE など)
            targetFileId: payload.targetFileId,     // どのファイルを
            destinationId: payload.destinationId || null, // どこへ（移動の場合）
            timestamp: Date.now()                   // 操作した時間
        };

        // キュー（リストの最後）に追加
        this.actionQueue.push(newAction);

        // 新しい操作をした場合、過去の「やり直し(Redo)」履歴は消去する（一般的なPCソフトと同じ挙動）
        this.undoStack = [];

        // [送信] 「予定が追加されたよ！」と全体にお知らせ（UIの更新や演出用）
        this.broadcastStatus('ACTION_QUEUED', newAction);
    },

    /**
     * 【処理2: 取り消し (Undo)】
     * 直前の操作をなかったことにします。
     */
    undoAction: function() {
        // もし予定リストが空なら、取り消すものがない
        if (this.actionQueue.length === 0) {
            EventBus.emit('SYSTEM_MESSAGE', { message: "取り消す操作がありません。" });
            return;
        }

        // 予定リストの最後（最新）の操作を取り出す
        const undoneAction = this.actionQueue.pop();

        // それを「やり直し用リスト」に保存しておく
        this.undoStack.push(undoneAction);

        // [送信] 「予定が取り消されたよ！」とお知らせ
        this.broadcastStatus('ACTION_UNDONE', undoneAction);
    },

    /**
     * 【処理3: やり直し (Redo)】
     * 取り消した操作をやっぱり実行します。
     */
    redoAction: function() {
        // もしやり直し用リストが空なら、やり直すものがない
        if (this.undoStack.length === 0) {
            EventBus.emit('SYSTEM_MESSAGE', { message: "やり直す操作がありません。" });
            return;
        }

        // やり直し用リストの最後（最新）の操作を取り出す
        const redoneAction = this.undoStack.pop();

        // 再び予定リストの最後に追加する
        this.actionQueue.push(redoneAction);

        // [送信] 「予定が復活したよ！」とお知らせ
        this.broadcastStatus('ACTION_REDO', redoneAction);
    },

    /**
     * 【補助: 状態の通知を一括送信】
     * 予定の増減があった際に、現在のリストの状況をまとめて発信します。
     */
    broadcastStatus: function(eventName, targetAction) {
        EventBus.emit(eventName, {
            action: targetAction,                  // 今回増減した具体的な操作データ
            currentQueueLength: this.actionQueue.length, // 現在の予定数
            canUndo: this.actionQueue.length > 0,        // Undo可能か（UIのボタン有効/無効に使う）
            canRedo: this.undoStack.length > 0           // Redo可能か
        });
    },

    /**
     * 【処理4: 現在のリストを提供する】
     * JSON化などのために、他のモジュールからデータを求められた際に発信します。
     */
    provideActionList: function() {
        // [送信] JsonManager等に向けて、現在の配列をそのまま渡す
        EventBus.emit('REQUEST_GENERATE_RESULT_JSON', { 
            actionQueue: this.actionQueue 
        });
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
ActionManager.init();

// --- UIやゲーム画面からの操作テスト ---

// パターンA: プレイヤーが「削除」を実行した
console.log("--- プレイヤーが削除操作を実行 ---");
EventBus.emit('USER_INTENT_ACTION', { 
    type: 'DELETE', 
    targetFileId: 'file-uuid-001' 
});
// 結果: ACTION_QUEUED が発信され、UIの「予定数: 1」が更新される

// パターンB: プレイヤーが「移動」を実行した
console.log("--- プレイヤーが移動操作を実行 ---");
EventBus.emit('USER_INTENT_ACTION', { 
    type: 'MOVE', 
    targetFileId: 'file-uuid-002',
    destinationId: 'folder-uuid-abc'
});
// 結果: ACTION_QUEUED が発信され、UIの「予定数: 2」が更新される

// パターンC: プレイヤーが「間違えた！」とUndoを押した
console.log("--- プレイヤーがUndoボタンを押下 ---");
EventBus.emit('REQUEST_UNDO');
// 結果: 直前の「移動」が取り消され、ACTION_UNDONE が発信される。「予定数: 1」になる。

// パターンD: 結果を出力（JsonManager連携）するため、リストを要求した
console.log("--- UIがResult.jsonの生成を要求 ---");
// このイベントで ActionManager.provideActionList() が呼ばれる想定で設定した場合
EventBus.emit('REQUEST_ACTION_LIST');
// 結果: REQUEST_GENERATE_RESULT_JSON が発信され、前回作成した JsonManager がそれを受け取ってJSONを作成する。
*/