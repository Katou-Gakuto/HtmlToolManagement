/**
 * 3a. UI Shell & 3b. Intelligent Assistant Controller
 */
class AppController {
    constructor() {
        this.theme = 'cyber';
        this.initThemeSystem();
        this.initUIListeners();
    }

    /**
     * テーマ切り替えシステム (第9章)
     */
    initThemeSystem() {
        const btnTheme = document.getElementById('btn-theme-cycle');
        if (btnTheme) {
            btnTheme.onclick = () => {
                this.theme = this.theme === 'cyber' ? 'library' : 'cyber';
                document.body.className = `theme-${this.theme}`;
                console.log(`テーマを ${this.theme} に変更しました。`);
            };
        }
    }

    /**
     * UIの表示・非表示管理およびリスナー設定
     */
    initUIListeners() {
        // ドックバーボタンによるウィンドウトグル
        document.querySelectorAll('.dock-btn').forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.getAttribute('data-target');
                const win = document.getElementById(targetId);
                if (win) {
                    win.classList.toggle('hidden-window');
                    btn.classList.toggle('active');
                }
            };
        });

        // 閉じるボタン（×）の処理
        document.querySelectorAll('.win-close-btn').forEach(btn => {
            btn.onclick = (e) => {
                const targetId = btn.getAttribute('data-target');
                const win = document.getElementById(targetId);
                if (win) {
                    win.classList.add('hidden-window');
                    const dockBtn = document.querySelector(`.dock-btn[data-target="${targetId}"]`);
                    if (dockBtn) dockBtn.classList.remove('active');
                }
            };
        });

        // アシスタント機能（スキルデモ）
        const passiveScan = document.getElementById('skill-passive-scan');
        if (passiveScan) {
            passiveScan.onclick = () => {
                const box = document.getElementById('pattern-suggestion-box');
                if (box) {
                    box.innerHTML = "💡 スキャン完了: *.jpg を発見しました。仕分けパターンを作成しますか？";
                    box.style.border = "1px solid #63b3ed";
                    passiveScan.style.backgroundColor = "#2b6cb0";
                }
            };
        }
    }
}

// 初期化
window.addEventListener("DOMContentLoaded", () => new AppController());