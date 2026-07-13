/**
 * =====================================================================
 * データ整合性チェックシステム (Data Validator)
 * 
 * 目的:
 * データ書き出し(Result.json)の直前で、アクションキューと現在の仮想ファイルシステムの
 * 状態を照合し、論理的な矛盾がないかを検証します。
 * 
 * 特徴:
 * - 書き出しプロセスを一度停止させ、安全確認を行います。
 * - 矛盾が見つかった場合、不正なJSONの生成を未然に防ぎ、エラーを通知します。
 * - 疎結合な設計のため、書き出し処理(JsonManager)の手前に挟むだけで動作します。
 * =====================================================================
 */

const DataValidator = {
    /**
     * 【初期化】
     * データ書き出しリクエストをインターセプト(割り込み)する準備をします。
     */
    init: function() {
        // [受信] 書き出しが要求された時、まずはバリデーションを走らせる
        EventBus.on('REQUEST_EXPORT', (payload) => this.runValidation(payload));
    },

    /**
     * 【処理: 検証実行】
     * 仮想ファイルシステム(VFS)とアクションキューの整合性をチェックします。
     * @param {Object} context - 現在のシステム状態を保持するデータ（ActionQueue, VFS状態など）
     */
    runValidation: function(context) {
        console.log("[DataValidator] 整合性チェックを開始します...");
        
        const errors = [];
        const actions = context.actionQueue || [];
        const files = context.files || {}; // VFSのファイルリスト

        actions.forEach((action, index) => {
            // 1. ファイル実在チェック
            if (!files[action.targetFileId]) {
                errors.push(`[Index ${index}] エラー: 操作対象のファイルID '${action.targetFileId}' がVFS上に存在しません。`);
            }

            // 2. 二重削除/削除済みファイルへの操作チェック
            // （アクションキュー内の前後の順序を考慮するロジックの簡易版）
            if (action.type === 'MOVE' && files[action.targetFileId]?.isDeleted) {
                errors.push(`[Index ${index}] エラー: 既に削除されたファイル '${action.targetFileId}' を移動しようとしています。`);
            }
        });

        if (errors.length > 0) {
            // [送信] チェック失敗: エラー内容を通知
            EventBus.emit('SYSTEM_ERROR', { 
                module: 'DataValidator', 
                message: 'データの整合性に問題があるため、書き出しを中断しました。',
                details: errors 
            });
            console.error("[DataValidator] 検証失敗:", errors);
        } else {
            // [送信] チェック成功: 次の処理（Json生成）へ進む許可を出す
            console.log("[DataValidator] 整合性チェック合格！書き出しを許可します。");
            EventBus.emit('VALIDATION_PASSED', context);
        }
    }
};

/**
 * =====================================================================
 * 【使用イメージ】
 * =====================================================================
 */

/*
// 1. 起動時
DataValidator.init();

// 2. プレイヤーがエクスポートボタンを押した際（従来は直接 JsonManager が動いていた）
// 今後は以下の流れになります：

// 2-a. UI (Unit C) は直接 JsonManager に頼まず、Validator にチェックを依頼する
EventBus.emit('REQUEST_EXPORT', { 
    actionQueue: ActionManager.actionQueue, 
    files: VirtualFileSystem.files 
});

// 2-b. Validator が合格(VALIDATION_PASSED)を出したら、JsonManager が動き出すように変更
EventBus.on('VALIDATION_PASSED', (context) => {
    EventBus.emit('REQUEST_GENERATE_RESULT_JSON', { actionQueue: context.actionQueue });
});
*/
```
eof

これで、システムに「書き出し前の安全検査」というフェーズが追加されました。
`DataValidator` を `EventBus` を介して既存の書き出しフローの間に挟むことで、不正なデータが外部に出力されることを防げます。

この設計で、プロジェクトの安全性は飛躍的に高まります。他にも何か気になるデータ管理の側面はありますか？