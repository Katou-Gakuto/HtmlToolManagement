/**
 * 仮想ファイルシステム ＆ 階層移動シミュレーター (Phase 1 拡張版)
 */
class MockFileSystem {
    constructor() {
        // 💡 現在プレイヤーがいる仮想ディレクトリのパス (例: ["root", "Documents"])
        this.currentPath = ["root"];
        
        // 💡 フォルダの階層構造（ツリーデータ）の定義
        this.fileTree = {
            "root": {
                name: "ルート部屋",
                entities: [
                    { id: "dir-docs", type: "folder", name: "Documents", targetDir: "Documents", x: 200, y: 150 },
                    { id: "dir-pics", type: "folder", name: "Pictures", targetDir: "Pictures", x: 500, y: 150 },
                    { id: "file-readme", type: "file", name: "README.txt", x: 350, y: 350 }
                ]
            },
            "Documents": {
                name: "Documentsの部屋",
                entities: [
                    { id: "dir-work", type: "folder", name: "Work_Project", targetDir: "Work_Project", x: 450, y: 200 },
                    { id: "file-report", type: "file", name: "報告書_2026.pdf", x: 200, y: 300 },
                    { id: "file-todo", type: "file", name: "TODO.md", x: 350, y: 400 }
                ]
            },
            "Pictures": {
                name: "Picturesの部屋",
                entities: [
                    { id: "file-photo1", type: "file", name: "旅の思い出.jpg", x: 200, y: 250 },
                    { id: "file-photo2", type: "file", name: "スクリーンショット.png", x: 500, y: 250 }
                ]
            },
            "Work_Project": {
                name: "Work_Projectの奥の部屋",
                entities: [
                    { id: "file-source", type: "file", name: "main.js", x: 350, y: 250 }
                ]
            }
        };
    }

    initMockFileSystem() {
        // 必要に応じて初期化処理
    }

    /**
     * 💡 現在の部屋（階層）に存在するエンティティを返す
     * 「上の階層に戻るドア」もここで動的に結合します。
     */
    getVisibleEntities() {
        const currentDirKey = this.currentPath[this.currentPath.length - 1];
        const dirData = this.fileTree[currentDirKey] || { name: "未知の部屋", entities: [] };
        
        // 基本のエンティティ
        let list = [...dirData.entities];

        // 💡 もし現在地が root ではないなら、「戻るドア」を左端に自動生成する
        if (this.currentPath.length > 1) {
            list.push({
                id: "dir-back-pointer",
                type: "folder",
                name: "⬅ 上の階層に戻る",
                targetDir: "..", // 特殊フラグ
                x: 80, 
                y: 250
            });
        }

        return list;
    }

    /**
     * 💡 部屋の切り替え処理 (Change Directory)
     */
    changeDirectory(targetDir) {
        if (targetDir === "..") {
            // 上の階層に戻る
            if (this.currentPath.length > 1) {
                this.currentPath.pop();
                return true;
            }
            return false;
        } else {
            // 指定のフォルダに進入する
            if (this.fileTree[targetDir]) {
                this.currentPath.push(targetDir);
                return true;
            }
            return false;
        }
    }

    /**
     * 現在の階層を文字列のパス表記で取得
     */
    getCurrentPathString() {
        return "/" + this.currentPath.join("/");
    }

    /**
     * トランザクション（仕分け）の擬似実行
     */
    executeTransactions(transactionList) {
        return transactionList.map(tx => {
            // 今回は簡単のため、ツリー全体の全エンティティから対象ファイルを探索して消去(移動)
            for (const key in this.fileTree) {
                this.fileTree[key].entities = this.fileTree[key].entities.filter(e => e.id !== tx.fileId);
            }
            
            return {
                success: true,
                name: tx.fileName,
                reason: tx.action === "DELETE" ? "削除神殿へ送られました" : `フォルダ【${tx.proposedDestination}】へ移動しました`
            };
        });
    }
}

window.mockSystem = new MockFileSystem();