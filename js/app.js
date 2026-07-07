class AppController {
    constructor() {
        this.uiSettings = { order: ["win-file-view", "win-preview-view", "win-log-view"] };
    }

    init() {
        // 1. システムとエンジンの初期化
        window.mockSystem.initDefaultTemplate();
        window.gameEngine.init("game-canvas");
        window.gameEngine.start();

        // 2. UIのセットアップ
        this.setupResizeSystem();
        this.setupDragAndDropSystem();
        this.setupDockButtons();
        this.setupKeyboardShortcuts();

        // AppControllerの init() メソッドの最後に追加
        this.syncAllDockButtons();

        this.addLog("システム起動: 準備完了", "success");

        // ==== 【検証：システム起動とモックデータの注入】 ====
        const vfs = new FileVirtualizer(sysEventBus);
        const sequencer = new ActionSequencer(sysEventBus, vfs);

        // 1. システム初期化（Rootフォルダ生成）
        const rootId = vfs.initEmptySystem("マイコンピュータ");

        // 2. フォルダ構造の生成（通常、整理先、削除神殿）
        const docFolderId = vfs.createFolder("Documents", rootId, "Normal");
        const organizeFolderId = vfs.createFolder("2026年写真整理", rootId, "Organize");
        const deleteTempleId = vfs.createFolder("削除神殿", rootId, "Delete"); // Type: Delete

        // 3. 混沌の未整理ファイルをDocuments配下にロード
        const file1 = vfs.createFile("vacation_photo", "jpg", 2048500, "/user/docs/vacation_photo.jpg", docFolderId);
        const file2 = vfs.createFile("malware_virus", "exe", 9999999, "/user/docs/malware_virus.exe", docFolderId);

        console.log("--- 初期状態の検証 ---");
        console.log("ファイル1の初期親ID:", vfs.getFile(file1).parentId === docFolderId ? "SUCCESS (Documents)" : "FAIL");

        // ==== 【検証：履歴駆動アクションの発行】 ====
        console.log("\n--- アクション実行の検証 ---");

        // テストA: file1を「2026年写真整理」フォルダに移動（Move）
        sequencer.pushAndExecute('Move', file1, { toFolderId: organizeFolderId });
        console.log("Move実行後のファイル1の親ID:", vfs.getFile(file1).parentId === organizeFolderId ? "SUCCESS (Organize)" : "FAIL");
        console.log("ファイル1にアクション履歴が刻印されているか:", vfs.getFile(file1).relatedActionIds.length === 1 ? "SUCCESS" : "FAIL");

        // テストB: file2を「削除」操作に（Deleteタイプだが削除神殿へのMoveを内包）
        sequencer.pushAndExecute('Delete', file2); 
        console.log("Delete実行後のファイル2の親ID:", vfs.getFile(file2).parentId === deleteTempleId ? "SUCCESS (削除神殿へ自動内包移動)" : "FAIL");

        // ==== 【検証：Undo / Redo のトランザクション制御】 ====
        console.log("\n--- Undo / Redo の検証 ---");

        // file2の削除を取り消し
        sequencer.undo();
        console.log("Undo後のファイル2の親ID:", vfs.getFile(file2).parentId === docFolderId ? "SUCCESS (Documentsへ帰還)" : "FAIL");
        console.log("Undo後のアクションステータス:", sequencer.history[1].status === 'Reverted' ? "SUCCESS" : "FAIL");

        // file2の削除をやり直し（Redo）
        sequencer.redo();
        console.log("Redo後のファイル2の親ID:", vfs.getFile(file2).parentId === deleteTempleId ? "SUCCESS (再び削除神殿へ)" : "FAIL");

        // ==== 【検証：永続化シリアライズ】 ====
        console.log("\n--- 永続化（JSON化）の検証 ---");
        const jsonSaveData = PersistenceHandler.serialize(vfs, sequencer);
        console.log("出力されたセーブデータの型:", typeof jsonSaveData === 'string' ? "SUCCESS (JSON文字列)" : "FAIL");
        console.log("生データのプレフィックス整合性チェック (ファイル1のID):", file1.startsWith('file_') ? "SUCCESS" : "FAIL");
    }

    // --- 以前の実装していた全ロジックを復活 ---

    setupResizeSystem() {
        // 右側（panel）のリサイズロジック
        document.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("resizer-y")) {
                const win = e.target.parentElement;
                const startY = e.clientY;
                const startH = parseInt(window.getComputedStyle(win).height);
                const onMove = (e) => win.style.height = (startH + e.clientY - startY) + "px";
                const onUp = () => document.removeEventListener("mousemove", onMove);
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp, { once: true });
            }
        });
    }

    setupDragAndDropSystem() {
        const container = document.getElementById("windows-container");
        container.addEventListener("dragstart", (e) => e.target.classList.add("dragging"));
        container.addEventListener("dragend", (e) => e.target.classList.remove("dragging"));
        container.addEventListener("dragover", (e) => {
            e.preventDefault();
            const after = e.clientY;
            const draggable = document.querySelector(".dragging");
            const siblings = [...container.querySelectorAll(".resizable-window:not(.dragging)")];
            const next = siblings.find(s => after < s.getBoundingClientRect().top + s.offsetHeight / 2);
            if (next) container.insertBefore(draggable, next);
            else container.appendChild(draggable);
        });
    }
    
    setupDockButtons() {
        // ボタンクリック時の挙動
        document.querySelectorAll(".dock-btn").forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.dataset.target;
                const targetWin = document.getElementById(targetId);
                
                if (targetWin) {
                    // ウィンドウの表示切り替え
                    targetWin.classList.toggle("hidden-window");
                    
                    // 💡 ボタンの見た目を状態に合わせて更新
                    this.syncDockButtonState(btn, targetWin);
                }
            };
        });

        // 閉じるボタン（×）を押したときもボタンの見た目を戻す
        document.querySelectorAll(".win-close-btn").forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.dataset.target;
                const targetWin = document.getElementById(targetId);
                targetWin.classList.add("hidden-window");
                
                // 対応するボタンを探してactiveを外す
                const btn = document.querySelector(`.dock-btn[data-target="${targetId}"]`);
                if (btn) btn.classList.remove("active");
            };
        });
    }

    // 💡 ボタンの見た目を同期するヘルパー関数
    syncDockButtonState(btn, win) {
        const isVisible = !win.classList.contains("hidden-window");
        if (isVisible) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    }

    setupKeyboardShortcuts() {
        window.addEventListener("keydown", (e) => {
            if (e.code === "Space") {
                // ここでエンジンのonPlayerInteractを呼び出す処理があれば繋ぐ
            }
        });
    }

    addLog(msg, type = "info") {
        const log = document.getElementById("log-list");
        if(log) log.innerHTML += `<div class="log-item ${type}">${msg}</div>`;
    }

    setupResizeSystem() {
        // --- 1. 縦幅リサイズ (既存) ---
        document.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("resizer-y")) {
                const win = e.target.parentElement;
                const startY = e.clientY;
                const startH = parseInt(window.getComputedStyle(win).height);
                const onMove = (e) => win.style.height = (startH + e.clientY - startY) + "px";
                const onUp = () => document.removeEventListener("mousemove", onMove);
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp, { once: true });
            }
            
            // --- 2. 横幅リサイズ (今回追加) ---
            if (e.target.classList.contains("resizer-x")) {
                const panel = document.getElementById("left-side-panel");
                const startX = e.clientX;
                const startW = parseInt(window.getComputedStyle(panel).width);
                
                const onMove = (e) => {
                    const newWidth = startW + (e.clientX - startX);
                    panel.style.width = newWidth + "px";
                };
                
                const onUp = () => document.removeEventListener("mousemove", onMove);
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp, { once: true });
            }
        });
    }

    syncAllDockButtons() {
        document.querySelectorAll(".dock-btn").forEach(btn => {
            const targetWin = document.getElementById(btn.dataset.target);
            if (targetWin) {
                if (!targetWin.classList.contains("hidden-window")) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            }
        });
    }
}

window.addEventListener("DOMContentLoaded", () => { new AppController().init(); });