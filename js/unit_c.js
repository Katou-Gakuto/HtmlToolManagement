/**
 * =====================================================================
 * ファイル管理・支援システム (Unit C: UI & Support Unit)
 * 
 * 目的:
 * UI側（整理View）におけるファイルの選択状態、検索機能（Skill）、
 * および自動整理の提案（Pattern）を管理します。
 * ゲーム内における「ファイルマネージャー」の役割を果たします。
 * 
 * 特徴:
 * - 実際のファイルデータは持たず、常にUnit A(VFS)へ問い合わせを行います。
 * - UIのボタン（HTML）からの操作を受け取り、高度な一括処理の「予定」を
 *   Unit A(ActionManager)へ転送します。
 * =====================================================================
 */

const FileSupportSystem = {
    // UI上で現在選択されているファイルのIDリスト
    selectedFileIds: [],
    
    // 過去の操作履歴（Pattern提案のための簡易的な学習データ）
    actionHistoryPattern: {},

    /**
     * 【初期化】
     */
    init: function() {
        // [受信] プレイヤーがUI上でファイルをクリックして選択/解除した時
        EventBus.on('USER_TOGGLE_SELECTION', (payload) => this.toggleSelection(payload));

        // [受信] プレイヤーが「Skill（拡張子検索など）」のボタンを押した時
        EventBus.on('USER_INVOKE_SKILL', (payload) => this.activateSkill(payload));

        // [受信] Unit A(VFS)から、検索結果のリストが返ってきた時
        EventBus.on('VFS_SEARCH_RESULTS', (payload) => this.handleSearchResults(payload));

        // [受信] 選択したファイル群に対して一括操作（移動・削除）を実行する時
        EventBus.on('USER_BATCH_ACTION', (payload) => this.executeBatchAction(payload));

        // [受信] ActionManagerで操作が確定した時（Pattern学習用）
        EventBus.on('ACTION_QUEUED', (payload) => this.learnPattern(payload));
    },

    /**
     * 【処理1: 個別選択の切り替え】
     * UI上でファイルがクリックされた際の選択状態を管理します。
     * @param {Object} payload 
     * @param {string} payload.fileId - 選択されたファイルのID
     * @param {boolean} payload.isMultiSelect - Shiftキー等での複数選択か
     */
    toggleSelection: function(payload) {
        const { fileId, isMultiSelect } = payload;

        if (!isMultiSelect) {
            // 単一選択の場合はリストをクリア
            this.selectedFileIds = [];
        }

        const index = this.selectedFileIds.indexOf(fileId);
        if (index === -1) {
            // 選ばれていなければ追加
            this.selectedFileIds.push(fileId);
        } else {
            // 既に選ばれていれば解除
            this.selectedFileIds.splice(index, 1);
        }

        // [送信] UIに対して「選択状態が変わったから画面（色など）を更新して」と伝える
        EventBus.emit('UI_SELECTION_UPDATED', { selectedCount: this.selectedFileIds.length, selectedIds: this.selectedFileIds });
    },

    /**
     * 【処理2: Skill（検索・一括選択支援）の実行】
     * 例：「.png のファイルを全て選択する」「10MB以上のファイルを全て選択する」など
     * @param {Object} payload 
     * @param {string} payload.skillType - 'BY_EXTENSION' | 'BY_SIZE' | 'BY_KEYWORD' など
     * @param {any} payload.condition - 検索条件（例: '.png', 10485760）
     */
    activateSkill: function(payload) {
        console.log(`[Unit C] Skill発動: ${payload.skillType} (条件: ${payload.condition})`);
        
        // 実際のファイルデータはUnit A(VFS)が持っているため、検索依頼を投げる
        EventBus.emit('REQUEST_VFS_SEARCH', {
            searchType: payload.skillType,
            condition: payload.condition
        });
    },

    /**
     * 【処理3: 検索結果の受け取りと反映】
     * Unit A(VFS)から検索結果が返ってきたら、それらを一括選択状態にします。
     */
    handleSearchResults: function(payload) {
        // 検索結果（IDの配列）を全て選択状態にする
        this.selectedFileIds = payload.foundFileIds || [];
        
        EventBus.emit('LOG_MESSAGE', { message: `Skill成功！ ${this.selectedFileIds.length}件のファイルを選択しました。` });
        EventBus.emit('UI_SELECTION_UPDATED', { selectedCount: this.selectedFileIds.length, selectedIds: this.selectedFileIds });
    },

    /**
     * 【処理4: Patternの学習】
     * プレイヤーが「どの拡張子のファイルを」「どのフォルダへ移動したか」を記憶し、
     * 次回の提案（サジェスト）に活かします。
     */
    learnPattern: function(payload) {
        const action = payload.action;
        
        if (action.type === 'MOVE') {
            // Unit Aに「このファイルの拡張子は何だったか」を問い合わせて学習する処理が本来は入ります。
            // ここでは簡易的に、"移動先フォルダID"が使われた回数をカウントアップします。
            const dest = action.destinationId;
            if (!this.actionHistoryPattern[dest]) {
                this.actionHistoryPattern[dest] = 0;
            }
            this.actionHistoryPattern[dest]++;
            
            // よく使う移動先として提案データを更新
            this.suggestPattern();
        }
    },

    /**
     * 【処理5: Patternの提案】
     * 頻繁に使われる整理パターンをUIに表示するよう促します。
     */
    suggestPattern: function() {
        // 例: 最も使われている移動先フォルダIDを特定
        let topDest = null;
        let maxCount = 0;
        
        for (const [destId, count] of Object.entries(this.actionHistoryPattern)) {
            if (count > maxCount) {
                maxCount = count;
                topDest = destId;
            }
        }

        if (topDest && maxCount >= 3) { // 3回以上同じ操作をしたら提案する
            // [送信] UIに対して「この移動先をクイックボタンとして表示して！」と提案
            EventBus.emit('PATTERN_SUGGESTED', { 
                suggestedDestinationId: topDest,
                reason: 'よく使用される整理先です'
            });
        }
    },

    /**
     * 【処理6: 選択ファイルへの一括アクション】
     * Skill等で複数選択したファイルに対して、一気に「移動」や「削除」の予定を作成します。
     * @param {Object} payload
     * @param {string} payload.actionType - 'MOVE' | 'DELETE'
     * @param {string} payload.destinationId - (MOVEの場合)
     */
    executeBatchAction: function(payload) {
        if (this.selectedFileIds.length === 0) {
            EventBus.emit('LOG_MESSAGE', { message: 'エラー: 操作対象のファイルが選択されていません。' });
            return;
        }

        // 選択されている全てのIDに対して、Unit Aへ「操作予定の追加」を依頼
        this.selectedFileIds.forEach(fileId => {
            EventBus.emit('USER_INTENT_ACTION', {
                type: payload.actionType,
                targetFileId: fileId,
                destinationId: payload.destinationId || null
            });
        });

        // 依頼が終わったら選択状態をリセット
        this.selectedFileIds = [];
        EventBus.emit('UI_SELECTION_UPDATED', { selectedCount: 0, selectedIds: [] });
        EventBus.emit('LOG_MESSAGE', { message: '一括操作をActionQueueに登録しました。' });
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
FileSupportSystem.init();


// 2. HTMLのファイル一覧（整理View）で、ユーザーがファイルをクリックした時
console.log("--- プレイヤーがファイルをクリック ---");
EventBus.emit('USER_TOGGLE_SELECTION', { 
    fileId: 'file-uuid-001', 
    isMultiSelect: false 
});
// 結果: 選択リストが更新され、UIが再描画される指示（UI_SELECTION_UPDATED）が飛ぶ


// 3. UIの「拡張子.pdfを全て選択(Skill)」ボタンを押した時
console.log("--- プレイヤーが拡張子検索Skillを使用 ---");
EventBus.emit('USER_INVOKE_SKILL', { 
    skillType: 'BY_EXTENSION', 
    condition: '.pdf' 
});
// 結果: Unit A(VFS)へ REQUEST_VFS_SEARCH が飛ぶ。
// VFSが検索して VFS_SEARCH_RESULTS を返すと、FileSupportSystemがそれを受け取り全て選択状態にする。


// 4. まとめて削除ボタンを押した時
console.log("--- プレイヤーが一括削除を実行 ---");
EventBus.emit('USER_BATCH_ACTION', { actionType: 'DELETE' });
// 結果: 選択されていた数だけ USER_INTENT_ACTION が発信され、ActionManagerが予定として登録する。
*/