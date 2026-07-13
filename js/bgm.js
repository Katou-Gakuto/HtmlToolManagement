/**
 * =====================================================================
 * 音響・BGM再生管理システム (Audio Manager)
 * 
 * 目的:
 * ゲーム内のBGMおよび効果音(SE)の再生、停止、音量調整を行います。
 * 
 * 特徴:
 * - AssetLoaderがキャッシュしたオーディオデータを取得して再生します。
 * - BGMはループ再生し、以前のBGMを止めて切り替える仕組みです。
 * - SEは複数同時再生を許容します。
 * - EventBusを介したイベント駆動型で、直接的な呼び出しを避けています。
 * =====================================================================
 */

const AudioManager = {
    // 現在再生中のBGMオブジェクト
    currentBGM: null,
    
    // グローバル音量設定
    volume: {
        bgm: 0.5,
        se: 0.8
    },

    /**
     * 【初期化】
     * システム起動時に呼び出し、イベントリスナーを登録します。
     */
    init: function() {
        // [受信] BGMを再生したい時
        EventBus.on('PLAY_BGM', (payload) => this.playBGM(payload.id));
        
        // [受信] BGMを止めたい時
        EventBus.on('STOP_BGM', () => this.stopBGM());
        
        // [受信] 効果音(SE)を鳴らしたい時
        EventBus.on('PLAY_SE', (payload) => this.playSE(payload.id));
        
        // [受信] 音量設定を変更したい時
        EventBus.on('SET_VOLUME', (payload) => this.setVolume(payload.type, payload.value));

        console.log("[AudioManager] 初期化完了。");
    },

    /**
     * 【処理1: BGMの再生】
     * 既存のBGMを止めて、新しい曲をループ再生します。
     * @param {string} id - AssetLoaderに登録されているオーディオID
     */
    playBGM: function(id) {
        // 既に何か鳴っていれば止める
        this.stopBGM();

        // AssetLoaderからデータ取得
        const audio = AssetLoader.get(id);
        if (!audio) {
            console.warn(`[AudioManager] BGMが見つかりません: ${id}`);
            return;
        }

        this.currentBGM = audio;
        this.currentBGM.loop = true;
        this.currentBGM.volume = this.volume.bgm;
        this.currentBGM.play().catch(e => console.error("[AudioManager] BGM再生失敗:", e));
        
        console.log(`[AudioManager] BGM再生開始: ${id}`);
    },

    /**
     * 【処理2: BGMの停止】
     */
    stopBGM: function() {
        if (this.currentBGM) {
            this.currentBGM.pause();
            this.currentBGM.currentTime = 0;
            this.currentBGM = null;
        }
    },

    /**
     * 【処理3: 効果音(SE)の再生】
     * SEは同時に複数鳴る可能性があるため、cloneNodeを使用して複製し、
     * 重なりを許容して再生します。音声アセットが見つからない場合はWeb Audio APIで生成します。
     * @param {string} id - AssetLoaderに登録されているオーディオID
     */
    playSE: function(id) {
        const source = AssetLoader.get(id);
        if (!source) {
            // アセットファイルが見つからない場合はブラウザ上で動的に効果音を合成して再生
            this.playSynthesizedSE(id);
            return;
        }

        // cloneNodeを使うことで、同じSEが連続して鳴っても前の音を中断せずに重ねて再生可能
        const se = source.cloneNode(true);
        se.volume = this.volume.se;
        se.play().catch(e => console.error("[AudioManager] SE再生失敗:", e));
        
        // 再生終了後にメモリ解放
        se.onended = () => { se.remove(); };
    },

    /**
     * 音声ファイルが無い場合に、Web Audio APIを用いてシンセサイザー音を再生します。
     */
    playSynthesizedSE: function(id) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const now = ctx.currentTime;
            
            if (id === 'se_interact') {
                // 接近・決定時のピッという高音
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(1000, now + 0.08);
                
                gain.gain.setValueAtTime(this.volume.se * 0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (id === 'se_dash') {
                // ダッシュ時のシュッというスイープ音
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(350, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
                
                gain.gain.setValueAtTime(this.volume.se * 0.25, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                
                osc.start(now);
                osc.stop(now + 0.15);
            } else {
                // デフォルト音
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                
                gain.gain.setValueAtTime(this.volume.se * 0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                
                osc.start(now);
                osc.stop(now + 0.08);
            }
            
            // 再生終了後にContextを破棄
            setTimeout(() => {
                ctx.close();
            }, 300);
            
        } catch (e) {
            console.error("[AudioManager] シンセサイズ効果音の再生に失敗しました:", e);
        }
    },

    /**
     * 【処理4: 音量設定】
     * @param {string} type - 'bgm' or 'se'
     * @param {number} value - 0.0 〜 1.0
     */
    setVolume: function(type, value) {
        this.volume[type] = Math.max(0, Math.min(1, value));
        
        if (type === 'bgm' && this.currentBGM) {
            this.currentBGM.volume = this.volume.bgm;
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
AudioManager.init();

// 2. どこかでBGMを鳴らしたい時
EventBus.emit('PLAY_BGM', { id: 'bgm_main' });

// 3. アクション成功時などにSEを鳴らしたい時
EventBus.emit('PLAY_SE', { id: 'se_success' });

// 4. コンフィグ画面などで音量を下げたい時
EventBus.emit('SET_VOLUME', { type: 'bgm', value: 0.2 });
*/