/**
 * =====================================================================
 * Event Bus (イベント駆動システム基盤)
 * 
 * 目的:
 * 各ユニット（Unit A, B, C）やHTMLのUIが、互いを直接知らなくても
 * 情報をやり取りできるようにするための中継地点です。
 * 
 * 特徴:
 * 「関数1つ（EventBus.emit）で引数の値を変えるだけで情報を渡す」
 * ことが可能になり、システム間の依存関係（直接的なつながり）を完全に断ち切ります。
 * =====================================================================
 */
const EventBus = {
    // 登録されたイベントと、そのイベントが発生した時に実行する関数のリストを保存する場所
    // 形式: { 'EVENT_NAME': [関数1, 関数2, ...] }
    listeners: {},

    /**
     * 【情報の受け取り側（受信）】
     * 特定のイベントが発生するのを待ち受けます。
     * 
     * @param {string} eventName - 待ち受けるイベントの名前（例: 'FILE_SELECTED'）
     * @param {Function} callback - イベントが発生した時に実行される関数。
     *                              送信側が渡したデータ(payload)を引数として受け取ります。
     */
    on: function(eventName, callback) {
        // まだそのイベント名のリストが存在しなければ、空の配列を作成
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        // 実行する関数をリストに追加
        this.listeners[eventName].push(callback);
    },

    /**
     * 【情報の渡し側（送信）】
     * システム全体に向けて「このイベントが起きた！」と情報を一斉送信します。
     * 
     * ※これがご要望の「関数1つで引数の値を変えるだけで情報を渡す」役割を担います。
     * 他のユニットの関数を直接呼ぶ必要は一切ありません。
     * 
     * @param {string} eventName - 送信するイベントの名前（例: 'USER_INTENT_ACTION'）
     * @param {Object} payload - 一緒に送りたいデータ。自由な形式のオブジェクト（{}）を渡せます。
     */
    emit: function(eventName, payload = {}) {
        // そのイベントを待ち受けている関数リストがあれば、全て実行する
        if (this.listeners[eventName]) {
            this.listeners[eventName].forEach(callback => {
                try {
                    // 登録された関数にデータを渡して実行
                    callback(payload);
                } catch (error) {
                    // どこかの機能でエラーが起きても、他の機能が止まらないように保護
                    console.error(`EventBus Error during '${eventName}':`, error);
                }
            });
        }
    },

    /**
     * 【情報の受け取り解除】
     * イベントの待ち受けをやめます。（※状況が変わって通知が不要になった場合に使用）
     * 
     * @param {string} eventName - 解除したいイベントの名前
     * @param {Function} callback - 登録時に使用した関数と同じもの
     */
    off: function(eventName, callback) {
        if (this.listeners[eventName]) {
            // 登録されているリストから、指定された関数だけを取り除く
            this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
        }
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * 
 * 以下のコードは、EventBusを使って異なる機能（UI、ロジック、マップ）が
 * どのように互いに影響を与えずに通信するかを示しています。
 * 組み込む際の参考にしてください。
 * =====================================================================
 */

// ---------------------------------------------------------
// 1. 各システムが「自分の仕事」に関する情報だけを待ち受ける (on)
// ---------------------------------------------------------

// [Unit A: ロジック担当] の仮想コード
EventBus.on('USER_REQUEST_DELETE', (data) => {
    // UIからの直接呼び出しではなく、イベント経由で呼ばれる
    console.log(`[Unit A] ${data.fileId} の削除予定をActionQueueに追加しました。`);
    
    // 処理が終わったら「予定が追加されたよ」と全体に通知
    EventBus.emit('ACTION_QUEUED', { totalActions: 1, actionType: 'DELETE' });
});

// [Unit B: マップ担当] の仮想コード
EventBus.on('ACTION_QUEUED', (data) => {
    // Unit Aが何をしたかは知らないが、「予定が追加された」ことに反応して演出を出す
    console.log(`[Unit B] リズム演出発生！ Comboが繋がりました！`);
});

// [Unit C: UI担当] の仮想コード
EventBus.on('ACTION_QUEUED', (data) => {
    // Unit Aが何をしたかは知らないが、「予定が追加された」ことに反応して画面を更新する
    console.log(`[Unit C] HUDを更新: 現在の予定Action数は ${data.totalActions} 個です。`);
});

// ---------------------------------------------------------
// 2. どこか（HTMLのボタンなど）から情報を発信する (emit)
// ---------------------------------------------------------

// 手動で繋ぐ場合、HTMLのボタンの onclick 等に以下のような1行を書くだけで済みます。
console.log("--- プレイヤーが削除ボタンを押したと仮定 ---");

// ★ これが「関数1つで引数の値を変えるだけで情報を渡す」瞬間です。
// 引数1: 何が起きたか（イベント名）
// 引数2: 必要なデータ（payload）
EventBus.emit('USER_REQUEST_DELETE', { 
    fileId: 'file-uuid-001', 
    fileName: 'old_document.txt' 
});

// 実行結果イメージ:
// --- プレイヤーが削除ボタンを押したと仮定 ---
// [Unit A] file-uuid-001 の削除予定をActionQueueに追加しました。
// [Unit B] リズム演出発生！ Comboが繋がりました！
// [Unit C] HUDを更新: 現在の予定Action数は 1 個です。