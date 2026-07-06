class MockFileSystem {
    constructor() {
        this.currentPath = ["root"];
        this.fileTree = {};
    }

    // 初期テンプレート生成（JSONがない場合）
    initDefaultTemplate() {
        this.importFromJSON({
            "root": [
                { id: "dir-docs", type: "folder", name: "Documents", targetDir: "Documents", x: 200, y: 150 },
                { id: "dir-pics", type: "folder", name: "Pictures", targetDir: "Pictures", x: 400, y: 150 },
                { id: "file-readme", type: "file", name: "README.txt", x: 300, y: 350 }
            ],
            "Documents": [
                { id: "dir-work", type: "folder", name: "Work_Project", targetDir: "Work_Project", x: 200, y: 200 },
                { id: "file-report", type: "file", name: "報告書_2026.pdf", x: 400, y: 200 }
            ],
            "Pictures": [
                { id: "file-photo1", type: "file", name: "旅の思い出.jpg", x: 300, y: 250 }
            ],
            "Work_Project": [
                { id: "file-source", type: "file", name: "main.js", x: 300, y: 250 }
            ]
        });
    }

    importFromJSON(jsonData) {
        this.fileTree = jsonData;
    }

    getVisibleEntities() {
        const currentDirKey = this.currentPath[this.currentPath.length - 1];
        // データがない場合は空の配列を返す
        let list = this.fileTree[currentDirKey] ? [...this.fileTree[currentDirKey]] : [];
        
        // 戻るボタンの追加
        if (this.currentPath.length > 1) {
            list.push({ id: "dir-back", type: "folder", name: "⬅ 戻る", targetDir: "..", x: 80, y: 250 });
        }
        return list;
    }

    changeDirectory(targetDir) {
        if (targetDir === "..") {
            if (this.currentPath.length > 1) {
                this.currentPath.pop();
                return true;
            }
        } else if (this.fileTree[targetDir]) {
            this.currentPath.push(targetDir);
            return true;
        }
        return false;
    }

    getCurrentPathString() {
        return "/" + this.currentPath.join("/");
    }
}
window.mockSystem = new MockFileSystem();