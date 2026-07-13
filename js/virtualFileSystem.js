/**
 * =====================================================================
 * 仮想ファイルシステム (Unit A: Core Logic Unit の一部)
 * 
 * 目的:
 * OSの実際のファイル構造を「ゲーム内で安全に扱えるIDベースの仮想データ」
 * としてメモリ上に保持・管理します。
 * 
 * 特徴:
 * - オブジェクト（ファイル・フォルダ）はすべてUUIDで管理されます。
 * - ActionManagerによって操作（移動・削除）が確定（ACTION_QUEUED）した際に、
 *   この仮想空間内でのファイルの所属先（親フォルダID等）を書き換えます。
 *   これにより、Unit B（マップ画面）の再描画が可能になります。
 * - Undo（やり直し）が発生した際も、仮想上の位置を元に戻します。
 * =====================================================================
 */

const VirtualFileSystem = {
    // すべてのファイルをIDで引ける辞書（Dictionary）
    files: {},
    
    // すべてのフォルダをIDで引ける辞書（Dictionary）
    folders: {},

    /**
     * 【初期化】
     * 自分が対応すべきイベントをEventBusに登録します。
     */
    init: function() {
        // [受信] 起動時などに「初期のフォルダ・ファイル構成を読み込んで」と言われた時
        EventBus.on('REQUEST_LOAD_VFS', (payload) => this.loadStructure(payload));

        // [受信] プレイヤーの操作が予定として追加された時（仮想空間での位置を更新するため）
        EventBus.on('ACTION_QUEUED', (payload) => this.updateVirtualState(payload));

        // [受信] 操作が取り消された時（仮想空間での位置を元に戻すため）
        EventBus.on('ACTION_UNDONE', (payload) => this.revertVirtualState(payload));

        // [受信] 特定のファイルやフォルダの情報が欲しいと言われた時（UIでの詳細表示など）
        EventBus.on('REQUEST_OBJECT_INFO', (payload) => this.provideObjectInfo(payload));
    },

    /**
     * 【処理1: 仮想構造の読み込み】
     * 外部（設定や実行プロジェクトからの初期データ）からファイルリストを受け取り、
     * IDベースの辞書データとして構築します。
     * 
     * @param {Object} payload 
     * @param {Array} payload.initialFiles - 読み込むファイルの配列
     * @param {Array} payload.initialFolders - 読み込むフォルダの配列
     */
    loadStructure: function(payload) {
        // 辞書をリセット
        this.files = {};
        this.folders = {};

        // フォルダデータの登録
        if (payload.initialFolders) {
            payload.initialFolders.forEach(folder => {
                this.folders[folder.id] = {
                    id: folder.id,
                    name: folder.name,
                    type: folder.type || 'NORMAL', // NORMAL(通常), TARGET(整理先), DELETION_TEMPLE(削除神殿)
                    parentFolderId: folder.parentFolderId || null, // 親フォルダIDをサポート
                    originalAbsolutePath: folder.originalAbsolutePath,
                    childrenFiles: [] // このフォルダに入っているファイルのIDリスト
                };
            });
        }

        // ファイルデータの登録
        if (payload.initialFiles) {
            payload.initialFiles.forEach(file => {
                this.files[file.id] = {
                    id: file.id,
                    name: file.name,
                    extension: file.extension,
                    sizeBytes: file.sizeBytes,
                    originalAbsolutePath: file.originalAbsolutePath,
                    currentFolderId: file.parentFolderId, // 現在仮想空間でどこにいるか
                    originalFolderId: file.parentFolderId, // ゲーム開始時の初期フォルダ（変更しない）
                    isDeleted: false // 仮想的に削除されたかどうかのフラグ
                };

                // 親フォルダ側の childrenFiles リストにもIDを登録しておく
                if (file.parentFolderId && this.folders[file.parentFolderId]) {
                    this.folders[file.parentFolderId].childrenFiles.push(file.id);
                }
            });
        }

        // [送信] 「仮想空間の構築が終わったよ！」とお知らせ（マップ描画機能などがこれを聞いて動き出します）
        EventBus.emit('VFS_UPDATED', { message: '初期構造の読み込み完了' });
    },

    /**
     * 【処理2: 操作による仮想空間の更新】
     * ActionManagerで操作が確定した際に呼ばれます。
     * マップ上の見た目を合わせるため、ファイルの位置IDや削除フラグを書き換えます。
     * 
     * @param {Object} payload - ActionManagerが発信したデータ { action, ... }
     */
    updateVirtualState: function(payload) {
        const action = payload.action;
        const targetFile = this.files[action.targetFileId];

        if (!targetFile) return; // 対象ファイルが存在しなければ無視

        // 操作を取り消した時に戻せるよう、移動前の位置をAction側に覚えさせておく（メモリ参照の工夫）
        action._previousFolderId = targetFile.currentFolderId;
        action._previousDeletedState = targetFile.isDeleted;

        // 操作種類に応じた仮想状態の変更
        if (action.type === 'MOVE') {
            // 元のフォルダからファイルIDを取り除く
            this._removeChildFromFolder(targetFile.currentFolderId, targetFile.id);
            // 新しいフォルダにファイルIDを追加する
            this._addChildToFolder(action.destinationId, targetFile.id);
            // ファイル自身の所属情報を更新
            targetFile.currentFolderId = action.destinationId;

        } else if (action.type === 'DELETE') {
            // 仮想的に削除扱いにする（削除神殿フォルダへ送った等の表現）
            targetFile.isDeleted = true;
        }

        // [送信] 「仮想空間の状態が変わったよ！」とお知らせ（マップの再描画用）
        EventBus.emit('VFS_UPDATED', { updatedFileId: targetFile.id, actionType: action.type });
    },

    /**
     * 【処理3: 取り消し(Undo)時の仮想空間の復元】
     * ActionManagerでUndoが実行された際に呼ばれます。
     * 覚えさせておいた「以前の状態」をもとに、ファイルを元の位置に戻します。
     * 
     * @param {Object} payload - ActionManagerが発信した取り消しデータ
     */
    revertVirtualState: function(payload) {
        const action = payload.action;
        const targetFile = this.files[action.targetFileId];

        if (!targetFile) return;

        if (action.type === 'MOVE') {
            // 移動先のフォルダから取り除く
            this._removeChildFromFolder(action.destinationId, targetFile.id);
            // 昔のフォルダに戻す
            this._addChildToFolder(action._previousFolderId, targetFile.id);
            targetFile.currentFolderId = action._previousFolderId;

        } else if (action.type === 'DELETE') {
            // 削除フラグを元に戻す
            targetFile.isDeleted = action._previousDeletedState;
        }

        // [送信] 「仮想空間の状態が元に戻ったよ！」とお知らせ
        EventBus.emit('VFS_UPDATED', { revertedFileId: targetFile.id, message: 'Undoによる復元' });
    },

    /**
     * 【処理4: 情報を求める機能への応答】
     * UI（Unit C）などが「このIDのファイルの名前を知りたい」と要求した時に返事をします。
     * 
     * @param {Object} payload 
     * @param {string} payload.targetId - 情報が欲しいオブジェクトのID
     */
    provideObjectInfo: function(payload) {
        const info = this.files[payload.targetId] || this.folders[payload.targetId] || null;
        
        // [送信] 「リクエストされた情報だよ！」と返す
        EventBus.emit('OBJECT_INFO_RESPONSE', { 
            targetId: payload.targetId,
            info: info
        });
    },

    /* --- 内部用ヘルパー関数 (外部からは直接呼ばない) --- */
    _removeChildFromFolder: function(folderId, fileId) {
        if (folderId && this.folders[folderId]) {
            this.folders[folderId].childrenFiles = this.folders[folderId].childrenFiles.filter(id => id !== fileId);
        }
    },

    _addChildToFolder: function(folderId, fileId) {
        if (folderId && this.folders[folderId] && !this.folders[folderId].childrenFiles.includes(fileId)) {
            this.folders[folderId].childrenFiles.push(fileId);
        }
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
VirtualFileSystem.init();

// 2. ゲーム開始時: OSから取得したデータ（という想定）を流し込む
console.log("--- 初期データの読み込み要求を発信 ---");
EventBus.emit('REQUEST_LOAD_VFS', {
    initialFolders: [
        { id: 'folder-root', name: 'Downloads', originalAbsolutePath: 'C:/Downloads' },
        { id: 'folder-trash', name: '削除神殿', type: 'DELETION_TEMPLE', originalAbsolutePath: 'C:/Trash' }
    ],
    initialFiles: [
        { id: 'file-001', name: 'report.pdf', parentFolderId: 'folder-root', originalAbsolutePath: 'C:/Downloads/report.pdf' },
        { id: 'file-002', name: 'image.png', parentFolderId: 'folder-root', originalAbsolutePath: 'C:/Downloads/image.png' }
    ]
});
// 結果: VFS_UPDATED が発信され、Unit B(マップ描画)がこのデータをもとにキャラを配置する。

// 3. 他のモジュール（ActionManager）で予定が追加された時の連動
// ※ ActionManager の "this.broadcastStatus('ACTION_QUEUED', ...)" が実行されると、
// 自動的に VirtualFileSystem.updateVirtualState が反応します。

// 4. UIがファイルの詳細情報を知りたい時
console.log("--- UIがファイル001の情報を要求 ---");
EventBus.emit('REQUEST_OBJECT_INFO', { targetId: 'file-001' });
// 結果: OBJECT_INFO_RESPONSE が発信され、UIが「ファイル名: report.pdf」等を画面に表示する。
*/