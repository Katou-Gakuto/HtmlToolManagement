/**
 * =====================================================================
 * アプリケーション統合コントローラー (Spatial App Controller)
 * 目的:
 * - HTML（UI、サイドパネル、キャンバス）のレイアウト変更監視や、
 * - ゲーム開始時の各モジュール初期化・依存起動シーケンスを管理します。
 * 特徴:
 * - 旧 main_app.js を完全にリプレイスし、EventBus経由で各単一モジュール（VFS、
 * Action、UI、Explorer、Engineなど）を一元的に初期化して安全に同期起動します。
 * - UIのドックバー（📁, ✨, 📜）とサイドパネルの折りたたみ表示状態のトグルを監視します。
 * - 横方向（サイドパネル幅）および縦方向（各積み上げウィンドウの高さ）の
 * ドラッグリサイズ（レジストイベント）を処理します。
 * =====================================================================
 */

class SpatialAppController {
    constructor() {
        // デフォルトのUIレイアウト設定
        this.uiSettings = {
            order: ["win-file-view", "win-log-view"],
            panelWidth: 350,
            windowHeights: {
                "win-file-view": 250,
                "win-log-view": 250
            }
        };
        this.isPanelResizing = false;
        this.activeResizingWindow = null;
    }

    /**
     * アプリケーション全体の起動
     */
    init() {
        addLocalLog("App Boot Sequencing started...");

        // 1. 各疎結合モジュールの順次初期化（依存関係を考慮）
        this.initAllModules();

        // 2. DOM要素のバインドとインタラクション設定
        this.setupLayoutInteractions();

        // 3. UIドックバーボタンのトグルイベントバインド
        this.setupDockInteractions();

        // 4. ゲームの開始と初期仮想ファイルデータ（VFS）のロード
        this.bootGameAndLoadInitialData();

        addLocalLog("App Boot Sequence completed successfully.", "success");
    }

    /**
     * 各種独立マネージャーの初期化呼び出し
     */
    initAllModules() {
        // A. コアデータ・ロジック (EventBusが先に読み込まれている前提)
        if (typeof VirtualFileSystem !== 'undefined' && VirtualFileSystem.init) {
            VirtualFileSystem.init();
        } else {
            // もしVFSにinitがなければ空の初期化ハンドラを追加
            VirtualFileSystem.init = function() {
                EventBus.on('REQUEST_LOAD_VFS', (payload) => {
                    this.files = payload.initialFiles || {};
                    EventBus.emit('VFS_UPDATED', this.files);
                });
            };
            VirtualFileSystem.init();
        }

        if (typeof ActionManager !== 'undefined' && ActionManager.init) {
            ActionManager.init();
        }
        if (typeof JsonManager !== 'undefined' && JsonManager.init) {
            JsonManager.init();
        }
        if (typeof DataValidator !== 'undefined' && DataValidator.init) {
            DataValidator.init();
        }

        // B. キャラクター・空間・入力
        if (typeof WorldExplorer !== 'undefined') {
            if (!WorldExplorer.player) {
                WorldExplorer.player = { x: 400, y: 300, speed: 5, isDashing: false, interactingTargetId: null };
            }
            WorldExplorer.init = function() {
                EventBus.on('USER_INPUT_MOVE', (payload) => {
                    if (this.player) {
                        const currentSpeed = payload.dash ? this.player.speed * 2.5 : this.player.speed;
                        this.player.x += payload.dx * currentSpeed;
                        this.player.y += payload.dy * currentSpeed;
                    }
                });
            };
            WorldExplorer.init();
        }

        if (typeof InputManager !== 'undefined' && InputManager.init) {
            InputManager.init();
        } else {
            // InputManagerが未ロード時の簡易フォールバック
            this.setupFallbackKeyboardInput();
        }

        // C. サポート・インフラ
        if (typeof FileSupportSystem !== 'undefined' && FileSupportSystem.init) {
            FileSupportSystem.init();
        }
        if (typeof SessionManager !== 'undefined' && SessionManager.init) {
            SessionManager.init();
        }
        if (typeof ThemeManager !== 'undefined' && ThemeManager.init) {
            ThemeManager.init();
        }
        if (typeof ExtensionManager !== 'undefined' && ExtensionManager.init) {
            ExtensionManager.init();
        }
        if (typeof AssetLoader !== 'undefined' && AssetLoader.init) {
            AssetLoader.init();
        }
        if (typeof AudioManager !== 'undefined' && AudioManager.init) {
            AudioManager.init();
        }
        if (typeof SceneManager !== 'undefined' && SceneManager.init) {
            SceneManager.init();
        }
        if (typeof GameLifecycleManager !== 'undefined' && GameLifecycleManager.init) {
            GameLifecycleManager.init();
        }

        // D. 描画・エンジンコア
        if (typeof RendererManager !== 'undefined') {
            RendererManager.init = function(canvasId) {
                this.canvas = document.getElementById(canvasId);
                if (this.canvas) {
                    this.ctx = this.canvas.getContext('2d');
                }
            };
            RendererManager.init('game-canvas');
        }

        if (typeof window.spatialEngineCore !== 'undefined') {
            window.spatialEngineCore.init();
        }
    }

    /**
     * InputManagerが見つからない、またはエラー時のキーボード代替ハンドラ
     */
    setupFallbackKeyboardInput() {
        const keyMap = {
            'ArrowUp': 'MOVE_UP', 'KeyW': 'MOVE_UP',
            'ArrowDown': 'MOVE_DOWN', 'KeyS': 'MOVE_DOWN',
            'ArrowLeft': 'MOVE_LEFT', 'KeyA': 'MOVE_LEFT',
            'ArrowRight': 'MOVE_RIGHT', 'KeyD': 'MOVE_RIGHT',
            'Space': 'ACTION_TRIGGER',
            'ShiftLeft': 'ACTION_DASH', 'ShiftRight': 'ACTION_DASH'
        };

        const handleKey = (e, isPressed) => {
            const command = keyMap[e.code] || keyMap[e.key];
            if (command) {
                e.preventDefault();
                EventBus.emit('INPUT_COMMAND', {
                    command: command,
                    state: isPressed ? 'PRESSED' : 'RELEASED'
                });
            }
        };

        window.addEventListener('keydown', (e) => handleKey(e, true));
        window.addEventListener('keyup', (e) => handleKey(e, false));
        addLocalLog("Fallback keyboard input system registered.");
    }

    /**
     * UIパネル・ウィンドウのドラッグリサイズ制御
     */
    setupLayoutInteractions() {
        const sidePanel = document.getElementById('left-side-panel');
        const resizerX = document.querySelector('.side-panel > .resizer-x');

        // 1. 横幅のリサイズ (サイドパネル全体)
        if (resizerX && sidePanel) {
            resizerX.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.isPanelResizing = true;
                document.body.style.cursor = 'col-resize';
                resizerX.classList.add('resizing');
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.isPanelResizing) return;
                const newWidth = e.clientX - sidePanel.getBoundingClientRect().left;
                if (newWidth >= 200 && newWidth <= 600) {
                    sidePanel.style.width = `${newWidth}px`;
                    this.uiSettings.panelWidth = newWidth;
                }
            });

            window.addEventListener('mouseup', () => {
                if (this.isPanelResizing) {
                    this.isPanelResizing = false;
                    document.body.style.cursor = 'default';
                    resizerX.classList.remove('resizing');
                }
            });
        }

        // 2. 縦方向のリサイズ (ウィンドウ個別)
        const windowContainers = document.querySelectorAll('.resizable-window');
        windowContainers.forEach((win) => {
            const resizerY = win.querySelector('.resizer-y');
            if (resizerY) {
                resizerY.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.activeResizingWindow = win;
                    document.body.style.cursor = 'row-resize';
                    resizerY.classList.add('resizing');
                });
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.activeResizingWindow) return;
            const rect = this.activeResizingWindow.getBoundingClientRect();
            const newHeight = e.clientY - rect.top;
            if (newHeight >= 80 && newHeight <= 500) {
                this.activeResizingWindow.style.height = `${newHeight}px`;
                this.uiSettings.windowHeights[this.activeResizingWindow.id] = newHeight;
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.activeResizingWindow) {
                const resizerY = this.activeResizingWindow.querySelector('.resizer-y');
                if (resizerY) resizerY.classList.remove('resizing');
                this.activeResizingWindow = null;
                document.body.style.cursor = 'default';
            }
        });
    }

    /**
     * ドックバーによるUI表示/非表示トグル制御
     */
    setupDockInteractions() {
        const dockButtons = document.querySelectorAll('.dock-btn');
        const winFile = document.getElementById('win-file-view');
        const winLog = document.getElementById('win-log-view');

        dockButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const title = btn.getAttribute('title');

                // アクティブクラスのトグル
                btn.classList.toggle('active');
                const isActive = btn.classList.contains('active');

                if (title === 'File Viewer' && winFile) {
                    if (isActive) {
                        winFile.classList.remove('hidden-window');
                    } else {
                        winFile.classList.add('hidden-window');
                    }
                } else if (title === 'System Logs' && winLog) {
                    if (isActive) {
                        winLog.classList.remove('hidden-window');
                    } else {
                        winLog.classList.add('hidden-window');
                    }
                } else if (title === 'Skills') {
                    addLocalLog("Skills window toggle clicked (Not implemented in view).", "info");
                }
            });
        });

        // 簡易ウィンドウクローズボタンの連動
        const closeButtons = document.querySelectorAll('.win-close-btn');
        closeButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const win = e.target.closest('.resizable-window');
                if (win) {
                    win.classList.add('hidden-window');
                    // 対応するドックボタンを非アクティブ化
                    if (win.id === 'win-file-view') {
                        const fileDock = document.querySelector('.dock-btn[title="File Viewer"]');
                        if (fileDock) fileDock.classList.remove('active');
                    } else if (win.id === 'win-log-view') {
                        const logDock = document.querySelector('.dock-btn[title="System Logs"]');
                        if (logDock) logDock.classList.remove('active');
                    }
                }
            });
        });
    }

    /**
     * 初期ゲームスタートとアセット・ダミーデータの展開
     */
    bootGameAndLoadInitialData() {
        // ゲームエンジンの起動要求
        EventBus.emit('GAME_STARTED');

        // 仮のOSファイルシステムからのデータロード要求
        addLocalLog("Requesting initial Virtual File System loads...");
        EventBus.emit('REQUEST_LOAD_VFS', {
            initialFolders: [
                { id: 'folder-root', name: 'Downloads', originalAbsolutePath: 'C:/Downloads' },
                { id: 'folder-trash', name: 'TrashTemple', type: 'DELETION_TEMPLE', originalAbsolutePath: 'C:/Trash' }
            ],
            initialFiles: {
                'file-001': { id: 'file-001', name: 'weekly_report.pdf', parentFolderId: 'folder-root', type: 'file' },
                'file-002': { id: 'file-002', name: 'profile_pic.png', parentFolderId: 'folder-root', type: 'file' },
                'file-003': { id: 'file-003', name: 'game_config.json', parentFolderId: 'folder-root', type: 'file' },
                'file-004': { id: 'file-004', name: 'Archived_Documents', parentFolderId: 'folder-root', type: 'folder' }
            }
        });
    }
}

// ドキュメント読み込み完了時にブートコントローラーをキック
window.addEventListener("DOMContentLoaded", () => {
    window.spatialAppController = new SpatialAppController();
    window.spatialAppController.init();
});

/**
 * モジュール内でログ出力画面にシステムログを流すヘルパー
 */
function addLocalLog(message, type = 'system') {
    const logContainer = document.getElementById('sys-log');
    if (logContainer) {
        const div = document.createElement('div');
        div.className = `log-item ${type}`;
        div.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}