/**
 * 仕分けトランザクション（操作予約）の管理
 */
class TransactionManager {
    constructor() {
        // { fileId, fileName, action, proposedDestination } の配列
        this.transactions = [];
    }

    // 💡 エンジンやアプリが参照するために必要なメソッド
    getTransactionForFile(fileId) {
        return this.transactions.find(t => t.fileId === fileId) || null;
    }

    addOrUpdateTransaction(fileId, fileName, action, destination) {
        // 既存の操作があれば更新、なければ追加
        this.removeTransaction(fileId);
        this.transactions.push({ fileId, fileName, action, proposedDestination: destination });
    }

    removeTransaction(fileId) {
        this.transactions = this.transactions.filter(t => t.fileId !== fileId);
    }

    getPendingList() {
        return this.transactions;
    }

    clearAll() {
        this.transactions = [];
    }

    // 💡 今回追加したエクスポート機能
    exportToJSON() {
        if (this.transactions.length === 0) {
            alert("エクスポートするデータがありません。");
            return;
        }

        const jsonString = JSON.stringify(this.transactions, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `transactions_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// グローバルにインスタンス化
window.transactionRegistry = new TransactionManager();