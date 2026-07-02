/**
 * アプリケーション全体のステート管理 ＆ メインエントリ
 */
class AppController {
    constructor() {
        this.currentFocusEntity = null;
        
        // 💡 将来JSONから受け取る、完全にカスタマイズ可能なUI配置・構造データ
        this.uiSettings = {
            panelWidth: 320, // サイドパネル全体の横幅
            windows: {
                "win-file-view": { show: true, height: 260 },
                "win-preview-view": { show: true, height: 220 },
                "win-log-view": { show: false, height: 180 },
                "win-skill-view": { show: false, height: 200 }
            },
            order: ["win-file-view", "win-preview-view", "win-log-view", "win-skill-view"] // 💡 随時変更される並び順
        };
    }

    init() {
        window.mockSystem.initMockFileSystem();
        window.gameEngine.init("game-canvas");
        window.gameEngine.start();

        // 💡 初期設定（並び順・サイズ・ON/OFF）を適用
        this.applyUISettings();

        this.setupUIEventListeners();
        this.setupResizeSystem();
        this.setupDragAndDropSystem(); // 💡 ドラッグ並び替えを有効化
        this.setupKeyboardShortcuts();
        
        this.updateHeaderCounters();
        this.updateDestinationsPreview();
        
        this.addLog("システム起動。ヘッダーを掴んで上下に並び替え、『×』で閉じ、左ドックで復元できます。", "success");
    }

    /**
     * 現在の設定（並び順、サイズ、表示状態）をDOMに完全適用
     */
    applyUISettings() {
        const sidePanel = document.getElementById("left-side-panel");
        const container = document.getElementById("windows-container");
        const dock = document.getElementById("dock-scroller");

        // 1. 全体の横幅を適用
        sidePanel.style.width = `${this.uiSettings.panelWidth}px`;

        // 2. 指定された順序（order）通りにDOM要素を並び替える
        this.uiSettings.order.forEach(winId => {
            const winEl = document.getElementById(winId);
            if (winEl) {
                container.appendChild(winEl); // 末尾に移動させることで順序を再構成
                
                // 高さ・表示状態の適用
                const config = this.uiSettings.windows[winId];
                winEl.style.height = `${config.height}px`;

                const btnEl = dock.querySelector(`[data-target="${winId}"]`);
                if (config.show) {
                    winEl.classList.remove("hidden-window");
                    if (btnEl) btnEl.classList.add("active");
                } else {
                    winEl.classList.add("hidden-window");
                    if (btnEl) btnEl.classList.remove("active");
                }
            }
        });
    }

    /**
     * ウィンドウのON/OFF
     */
    toggleWindow(winId, forceState = null) {
        if (!this.uiSettings.windows[winId]) return;
        
        const nextState = (forceState !== null) ? forceState : !this.uiSettings.windows[winId].show;
        this.uiSettings.windows[winId].show = nextState;
        
        this.applyUISettings();
        this.addLog(`[${document.getElementById(winId).querySelector('.drag-handle').textContent.replace('☰ ', '')}] を ${nextState ? '表示' : '非表示'} にしました。`);
    }

    /**
     * 💡 縦（ウィンドウ高さ）・横（パネル幅）の独立リサイズシステム
     */
    setupResizeSystem() {
        const workspace = document.getElementById("main-workspace");
        let activeResizer = null;
        let startX = 0, startY = 0;
        let startWidth = 0, startHeight = 0;
        let targetWindow = null;

        workspace.addEventListener("mousedown", (e) => {
            // 横リサイズ（パネル幅）
            if (e.target.classList.contains("resizer-x")) {
                activeResizer = e.target;
                const panel = document.getElementById("left-side-panel");
                startX = e.clientX;
                startWidth = parseInt(window.getComputedStyle(panel).width, 10);
                activeResizer.classList.add("resizing");
                e.preventDefault();
            }
            // 縦リサイズ（各ウィンドウの高さ）
            else if (e.target.classList.contains("resizer-y")) {
                activeResizer = e.target;
                targetWindow = activeResizer.parentElement;
                startY = e.clientY;
                startHeight = parseInt(window.getComputedStyle(targetWindow).height, 10);
                activeResizer.classList.add("resizing");
                e.preventDefault();
            }
        });

        window.addEventListener("mousemove", (e) => {
            if (!activeResizer) return;

            if (activeResizer.classList.contains("resizer-x")) {
                const deltaX = e.clientX - startX;
                let newWidth = startWidth + deltaX;
                if (newWidth < 200) newWidth = 200;
                if (newWidth > 600) newWidth = 600;
                
                document.getElementById("left-side-panel").style.width = `${newWidth}px`;
                this.uiSettings.panelWidth = newWidth;
            } 
            else if (activeResizer.classList.contains("resizer-y") && targetWindow) {
                const deltaY = e.clientY - startY;
                let newHeight = startHeight + deltaY;
                if (newHeight < 80) newHeight = 80;
                if (newHeight > 500) newHeight = 500;
                
                targetWindow.style.height = `${newHeight}px`;
                this.uiSettings.windows[targetWindow.id].height = newHeight;
            }
        });

        window.addEventListener("mouseup", () => {
            if (activeResizer) {
                activeResizer.classList.remove("resizing");
                activeResizer = null;
                targetWindow = null;
            }
        });
    }

    /**
     * 💡 ドラッグ＆ドロップによる随時順序変更システム
     */
    setupDragAndDropSystem() {
        const container = document.getElementById("windows-container");
        let draggedItem = null;

        container.addEventListener("dragstart", (e) => {
            // drag-handleを掴んでいるときだけドラッグを許可
            if (e.target.classList.contains("resizable-window")) {
                draggedItem = e.target;
                draggedItem.classList.add("dragging");
            }
        });

        container.addEventListener("dragend", () => {
            if (draggedItem) {
                draggedItem.classList.remove("dragging");
                draggedItem = null;
                
                // 💡 並び替え完了時に、現在のDOMの並び順から order 配列を随時更新（JSON保存用）
                const currentWindows = Array.from(container.querySelectorAll(".resizable-window"));
                this.uiSettings.order = currentWindows.map(el => el.id);
            }
        });

        container.addEventListener("dragover", (e) => {
            e.preventDefault(); // ドロップを許可するために必要
            
            const target = e.target.closest(".resizable-window");
            if (target && target !== draggedItem) {
                // マウスのY座標が、ターゲット要素の中央より上か下かで挿入位置を決定
                const rect = target.getBoundingClientRect();
                const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
                container.insertBefore(draggedItem, next ? target.nextSibling : target);
            }
        });
    }

    /**
     * ログの追加
     */
    addLog(message, type = "info") {
        const logList = document.getElementById("log-list");
        if (!logList) return;
        
        const logItem = document.createElement("div");
        const time = new Date().toLocaleTimeString();
        logItem.className = `log-item ${type}`;
        logItem.textContent = `[${time}] ${message}`;
        logList.appendChild(logItem);
        logList.scrollTop = logList.scrollHeight;
    }

    updateDestinationsPreview() {
        const container = document.getElementById("preview-list-container");
        if (!container) return;
        container.innerHTML = "";

        const list = window.transactionRegistry.getPendingList();
        if (list.length === 0) {
            container.innerHTML = `<p class="placeholder-text">現在、移動予定のファイルはありません。</p>`;
            return;
        }

        const groups = {};
        list.forEach(item => {
            const dest = item.proposedDestination;
            if (!groups[dest]) groups[dest] = [];
            groups[dest].push(item);
        });

        for (const [folderName, items] of Object.entries(groups)) {
            const folderBlock = document.createElement("div");
            folderBlock.style.marginBottom = "8px";
            folderBlock.style.background = "#1a202c";
            folderBlock.style.padding = "6px";
            folderBlock.style.borderRadius = "4px";
            folderBlock.style.borderLeft = `3px solid ${folderName === '削除神殿' ? '#e53e3e' : '#4299e1'}`;

            const title = document.createElement("div");
            title.style.fontWeight = "bold";
            title.style.fontSize = "0.8rem";
            title.textContent = `📁 【${folderName}】への予定:`;
            folderBlock.appendChild(title);

            const fileList = document.createElement("ul");
            fileList.style.paddingLeft = "12px";
            fileList.style.fontSize = "0.75rem";
            fileList.style.color = "#cbd5e0";
            
            items.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item.fileName;
                fileList.appendChild(li);
            });

            folderBlock.appendChild(fileList);
            container.appendChild(folderBlock);
        }
    }
onPlayerInteract(entity) {
        if (window.gameEngine.activeOverlay) return;

        // --- ファイルに接触した場合 ---
        if (entity.type === "file") {
            this.currentFocusEntity = entity;
            
            // ファイル接触時に閉じていたら自動でONに戻す
            if (!this.uiSettings.windows["win-file-view"].show) {
                this.toggleWindow("win-file-view", true);
            }
            this.openFileSideUI(entity);
            this.addLog(`ファイル [${entity.name}] をターゲットしました。`, "info");
        } 
        
        // --- 💡 フォルダに接触した場合（今回の主役） ---
        else if (entity.type === "folder") {
            const success = window.mockSystem.changeDirectory(entity.targetDir);
            
            if (success) {
                // 1. プレイヤーを中央付近にリポジショニング（ドアに即再接触するのを防ぐ）
                window.gameEngine.player.x = 350;
                window.gameEngine.player.y = 250;
                
                // 2. 開いていたサイドのファイルUIをリセット
                this.closeFileSideUI();
                
                // 3. パス表示やカウンターの更新
                const newPath = window.mockSystem.getCurrentPathString();
                this.addLog(`部屋を移動しました。現在地: ${newPath}`, "success");
                
                // 4. タイトルやヘッダーの情報を現在のディレクトリ名に更新
                document.querySelector(".header-title").textContent = `📂 Dungeon: ${newPath}`;
                
                this.updateHeaderCounters();
                this.updateDestinationsPreview();
            } else {
                this.addLog(`フォルダ [${entity.name}] には進めません。`, "warn");
            }
        }
    }

    openFileSideUI(file) {
        const title = document.getElementById("panel-file-title");
        const status = document.getElementById("panel-file-status");
        const folderContainer = document.getElementById("folder-buttons-container");

        title.textContent = `📄 対象: ${file.name}`;
        
        const existingTx = window.transactionRegistry.getTransactionForFile(file.id);
        if (existingTx) {
            status.textContent = `予定: 【${existingTx.proposedDestination}】`;
            status.style.color = existingTx.action === "DELETE" ? "#fc8181" : "#63b3ed";
        } else {
            status.textContent = "ステータス: 未分類";
            status.style.color = "#a0aec0";
        }

        folderContainer.innerHTML = "";
        const folders = window.mockSystem.getVisibleEntities().filter(e => e.type === "folder");
        
        folders.forEach(folder => {
            const btn = document.createElement("button");
            btn.className = "btn-secondary";
            btn.style.textAlign = "left";
            btn.textContent = `🚪 【${folder.name}】へ送る`;
            btn.onclick = () => {
                window.transactionRegistry.addOrUpdateTransaction(file.id, file.name, "MOVE", folder.name);
                this.addLog(`[${file.name}] を [${folder.name}] へ送る予定にしました。`, "info");
                this.closeFileSideUI();
            };
            folderContainer.appendChild(btn);
        });
    }

    closeFileSideUI() {
        this.currentFocusEntity = null;
        this.updateHeaderCounters();
        this.updateDestinationsPreview();

        document.getElementById("panel-file-title").textContent = "対象ファイル: なし";
        document.getElementById("panel-file-status").textContent = "ステータス: 未選択";
        document.getElementById("panel-file-status").style.color = "#a0aec0";
        document.getElementById("folder-buttons-container").innerHTML = `
            <p class="placeholder-text">ファイルに近づいてSPACEを押すと、ここに仕分け先フォルダが表示されます。</p>
        `;
    }

    setAsPending() {
        if (this.currentFocusEntity) {
            window.transactionRegistry.removeTransaction(this.currentFocusEntity.id);
            this.addLog(`[${this.currentFocusEntity.name}] の予定を保留に戻しました。`, "info");
        }
        this.closeFileSideUI();
    }

    setAsDelete() {
        if (this.currentFocusEntity) {
            window.transactionRegistry.addOrUpdateTransaction(this.currentFocusEntity.id, this.currentFocusEntity.name, "DELETE", "削除神殿");
            this.addLog(`[${this.currentFocusEntity.name}] を [削除神殿] へ送る予定にしました。`, "warn");
        }
        this.closeFileSideUI();
    }

    openFinalConfirmModal() {
        window.gameEngine.activeOverlay = true;
        const modal = document.getElementById("confirm-modal");
        const tbody = document.getElementById("confirm-list-body");
        tbody.innerHTML = "";

        const list = window.transactionRegistry.getPendingList();

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#a0aec0;">変更予定がありません。</td></tr>`;
            document.getElementById("execute-commit-btn").classList.add("hidden-element");
        } else {
            document.getElementById("execute-commit-btn").classList.remove("hidden-element");
            list.forEach(item => {
                const tr = document.createElement("tr");
                const badgeColor = item.action === "DELETE" ? "#fc8181" : "#48bb78";
                tr.innerHTML = `
                    <td><strong>${item.fileName}</strong></td>
                    <td><span style="color:${badgeColor}; font-weight:bold;">${item.action}</span></td>
                    <td>${item.proposedDestination}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        modal.classList.remove("hidden-element");
    }

    closeFinalConfirmModal() {
        document.getElementById("confirm-modal").classList.add("hidden-element");
        window.gameEngine.activeOverlay = false;
        this.currentFocusEntity = null;
    }

    executeCommit() {
        const list = window.transactionRegistry.getPendingList();
        const reports = window.mockSystem.executeTransactions(list);

        reports.forEach(r => {
            if (r.success) this.addLog(`【成功】${r.name} ➔ ${r.reason}`, "success");
        });
        
        window.transactionRegistry.clearAll();
        this.closeFinalConfirmModal();
        this.closeFileSideUI();
    }

    updateHeaderCounters() {
        const totalFiles = window.mockSystem.getVisibleEntities().filter(e => e.type === "file").length;
        const totalPending = window.transactionRegistry.getPendingList().length;
        
        document.getElementById("file-count-badge").textContent = `未整理: ${totalFiles} 件`;
        document.getElementById("transaction-badge").textContent = `変更予定: ${totalPending} 件`;
    }

    setupUIEventListeners() {
        document.getElementById("btn-hold").onclick = () => this.setAsPending();
        document.getElementById("btn-delete").onclick = () => this.setAsDelete();
        document.getElementById("btn-manager-ui").onclick = () => this.openFinalConfirmModal();
        document.getElementById("modal-cancel-btn").onclick = () => this.closeFinalConfirmModal();
        document.getElementById("execute-commit-btn").onclick = () => this.executeCommit();

        // ドックバーのアイコンクリックで表示・非表示のトグル切り替え
        const dockScroller = document.getElementById("dock-scroller");
        dockScroller.querySelectorAll(".dock-btn").forEach(btn => {
            btn.onclick = () => {
                const targetWin = btn.getAttribute("data-target");
                this.toggleWindow(targetWin);
            };
        });

        // 💡 ウィンドウの『×』ボタンでの非表示処理
        document.querySelectorAll(".win-close-btn").forEach(btn => {
            btn.onclick = () => {
                const targetWin = btn.getAttribute("data-target");
                this.toggleWindow(targetWin, false);
            };
        });
    }

    setupKeyboardShortcuts() {
        window.addEventListener("keydown", (e) => {
            if (e.code === "KeyC") {
                const modal = document.getElementById("confirm-modal");
                if (modal.classList.contains("hidden-element")) {
                    this.openFinalConfirmModal();
                } else {
                    this.closeFinalConfirmModal();
                }
            }
            if (e.code === "Escape") {
                this.closeFinalConfirmModal();
                this.closeFileSideUI();
            }
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.app = new AppController();
    window.app.init();
});