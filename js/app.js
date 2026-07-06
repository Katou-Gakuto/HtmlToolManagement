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