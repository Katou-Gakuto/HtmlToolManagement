/**
 * 変更予定（Transaction）マネージャー
 */
class TransactionRegistry {
    constructor() {
        this.pendingList = []; // 変更予定を格納する配列
    }

    /**
     * 変更予定の追加、または上書き
     */
    addOrUpdateTransaction(fileId, fileName, action, destination) {
        // 既存の予定があれば上書き、なければ新規追加
        this.removeTransaction(fileId);

        let destName = destination;
        if (action === "DELETE") {
            destName = "削除フォルダ";
        }

        this.pendingList.push({
            fileId: fileId,
            fileName: fileName,
            action: action, // 'MOVE' | 'DELETE' | 'CREATE_FOLDER'
            proposedDestination: destName,
            timestamp: Date.now()
        });
    }

    /**
     * 予定の取り消し（保留・元の状態に戻す）
     */
    removeTransaction(fileId) {
        this.pendingList = this.pendingList.filter(item => item.fileId !== fileId);
    }

    /**
     * 特定のファイルの現在の予定を取得
     */
    getTransactionForFile(fileId) {
        return this.pendingList.find(item => item.fileId === fileId) || null;
    }

    /**
     * 全ての変更予定リストを取得
     */
    getPendingList() {
        return this.pendingList;
    }

    /**
     * リストの全クリア（キャンセル時など）
     */
    clearAll() {
        this.pendingList = [];
    }
}

window.transactionRegistry = new TransactionRegistry();