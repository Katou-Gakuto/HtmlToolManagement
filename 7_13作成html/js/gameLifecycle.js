/**
 * =====================================================================
 * ゲームライフサイクル管理 (Game Lifecycle Manager)
 * 
 * 目的:
 * ゲーム全体の起動、初期化、終了処理を一元管理します。
 * 各ユニット（A, B, C）を直接操作するのではなく、イベントを発信することで
 * シームレスな起動と、データ損失を防ぐ安全な終了（自動保存・エクスポート）を実現します。
 * =====================================================================
 */

const GameLifecycleManager = {
    /**
     * 【初期化】
     * アプリケーションがブラウザで読み込まれた直後に実行します。
     * 全ユニットの待機状態を作り、いつでもスタートできる準備を整えます。
     */
    init: function() {
        // システムが終了合図を受け取った時の処理
        EventBus.on('GAME_REQUEST_SHUTDOWN', () => this.shutdown());
        
        // エラー発生時の安全停止
        EventBus.on('SYSTEM_ERROR', (payload) => {
            console.error("[Lifecycle] システムエラーにより停止します:", payload);
            this.shutdown();
        });

        console.log("[Lifecycle] マネージャー初期化完了。準備完了。");
    },

    /**
     * 【処理1: 起動 (Start)】
     * ゲームをスタートさせます。
     * ロード画面の解除や、マップの描画開始のトリガーとなります。
     */
    start: function() {
        console.log("[Lifecycle] ゲームを開始します...");

        // 1. 各ユニットに対して「動け！」と合図を送る
        EventBus.emit('GAME_STARTED', { timestamp: Date.now() });

        // 2. VFS(Unit A)に初期データのロードを指示（仮の初期データ）
        EventBus.emit('REQUEST_LOAD_VFS', {
            initialFolders: [{ id: 'root', name: 'Downloads' }],
            initialFiles: [{ id: 'f1', name: 'doc.txt', parentFolderId: 'root' }]
        });
    },

    /**
     * 【処理2: 終了 (Shutdown)】
     * ゲームを安全に終了します。
     * 終了直前に Result.json を生成させるなど、データ損失を防ぐための
     * 「後始末」を確実に行います。
     */
    shutdown: function() {
        console.log("[Lifecycle] ゲームを終了します。後始末を開始します...");

        // 1. まず「終了準備中」という通知を送り、各ユニットに作業を中断させる
        EventBus.emit('GAME_SHUTDOWN_PREPARING', {});

        // 2. 最終結果を保存するために、JSON生成をリクエスト
        // ActionManagerに現在の全Actionリストを要求するイベントを発火
        EventBus.emit('REQUEST_ACTION_LIST', {});

        // 3. UIに対して終了画面を表示するよう通知
        EventBus.emit('UI_SHOW_SHUTDOWN_SCREEN', { message: "保存中..." });

        // 4. 全イベントリスナーの解除（メモリーリーク防止）
        // ※必要に応じて EventBus.listeners = {} 等で全リセット可能
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
GameLifecycleManager.init();

// 2. HTMLの「スタートボタン」などが押された時
// ユニット間の複雑な依存関係を意識せず、この関数を呼ぶだけ
function onStartButtonClick() {
    GameLifecycleManager.start();
}

// 3. ブラウザのタブを閉じる前や、ゲーム内の「セーブして終了」ボタンを押した時
function onShutdownButtonClick() {
    GameLifecycleManager.shutdown();
}

// 4. もし「セーブデータのエクスポート」が完了したら終了させたい場合
EventBus.on('RESULT_JSON_GENERATED', (data) => {
    console.log("[Lifecycle] 保存完了！ブラウザを閉じられます。");
    // ここで実際にウィンドウを閉じる処理などを追加可能
});
*/
```

これで、システム全体を俯瞰する「司令塔」ができました。

これで、プロジェクトに必要な主要ユニット（A, B, C）およびそのライフサイクル管理のコードが出揃いました。これらをすべてHTMLのスクリプトタグ内に順番通り（EventBusを最初にして）配置することで、ゲームシステムが動き出します。

最後に、これまでのコードを統合して、**「すぐに動かせるテスト用HTML全体像」**を作成しましょうか？それとも、個別の修正や追加機能の作成が必要ですか？