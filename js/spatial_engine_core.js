/**
 * =====================================================================
 * イベント駆動型2D描画・更新エンジン (Spatial Engine Core)
 * 目的:
 * - 2Dゲームループの管理、物理更新、衝突判定、およびRendererManagerと協調した
 * Canvasへの描画処理を司ります。
 * 特徴:
 * - EventBus経由でInputManagerから流れる抽象コマンド（MOVE_UP等）を受け取り、
 * WorldExplorer内のプレイヤー座標を滑らかに更新します。
 * - VirtualFileSystem内のファイルオブジェクトに2D空間の物理座標をマッピングし、
 * プレイヤーとの接近判定（衝突・インタラクト可能距離）をリアルタイムに計算します。
 * - 描画は、RendererManagerに統合されたコンテキストを用いて、背景、グリッド、
 * オブジェクト、プレイヤー、HUD（接近中のファイル名表示など）をレイレイヤードにレンダリングします。
 * =====================================================================
 */

const SpatialEngineCore = {
    animationFrameId: null,
    lastTime: 0,
    
    // 入力の現在状態（滑らかな移動を実現するためにキープレス状態を記憶）
    inputState: {
        up: false,
        down: false,
        left: false,
        right: false,
        dash: false
    },

    // 現在メニューが表示されている対象のファイルID
    activeMenuTargetId: null,

    // 2D空間内のエンティティ（ファイル/フォルダ）の座標情報キャッシュ
    spatialEntities: {}, // { fileId: { id, x, y, width, height, type, name } }
    
    // 空間定数
    GRID_SIZE: 50,
    INTERACT_RANGE: 45, // インタラクト（接近）と判定するピクセル距離
    WORLD_WIDTH: 1600,  // 仮想ワールドの幅
    WORLD_HEIGHT: 1200, // 仮想ワールドの高さ

    // 階層ナビゲーション: 現在表示中のフォルダID
    currentViewFolderId: 'folder-root',

    /**
     * エンジンの初期化
     */
    init: function() {
        this.registerEventListeners();
        addLocalLog("Spatial Engine Core initialized.");
    },

    /**
     * EventBusイベントの登録
     */
    registerEventListeners: function() {
        // ゲームが開始されたらループを起動
        EventBus.on('GAME_STARTED', () => {
            this.start();
        });

        // シーンがGAMEに切り替わった場合も連動
        EventBus.on('SCENE_CHANGED', (payload) => {
            if (payload.currentScene === 'GAME') {
                this.start();
            } else {
                this.stop();
            }
        });

        // ライフサイクルからの停止要求
        EventBus.on('GAME_REQUEST_SHUTDOWN', () => {
            this.stop();
        });

        // InputManagerからの抽象入力コマンドを受け取る
        EventBus.on('INPUT_COMMAND', (payload) => {
            this.handleInput(payload.command, payload.state);
        });

        // VirtualFileSystemのデータ更新を検知して空間配置を更新
        EventBus.on('VFS_UPDATED', () => {
            this.syncVFSToSpatialEntities();
        });

        // ファイルシステムに検索や特定のアクションが起きた際の描画フィードバック用
        EventBus.on('UI_SELECTION_UPDATED', (payload) => {
            // 選択状態のエンティティを描画時に強調するための更新
            this.selectedFileIds = payload.selectedFileIds || [];
        });

        // メニュー操作用の生のキー入力を監視
        window.addEventListener('keydown', (e) => {
            if (this.activeMenuTargetId) {
                this.handleMenuKey(e);
            }
        });
    },

    /**
     * 入力コマンドの解釈
     * @param {string} command - MOVE_UP, ACTION_DASH などのコマンド名
     * @param {string} state - PRESSED または RELEASED
     */
    handleInput: function(command, state) {
        const isPressed = (state === 'PRESSED');

        switch (command) {
            case 'MOVE_UP':
                this.inputState.up = isPressed;
                break;
            case 'MOVE_DOWN':
                this.inputState.down = isPressed;
                break;
            case 'MOVE_LEFT':
                this.inputState.left = isPressed;
                break;
            case 'MOVE_RIGHT':
                this.inputState.right = isPressed;
                break;
            case 'ACTION_DASH':
                this.inputState.dash = isPressed;
                if (isPressed && WorldExplorer.player) {
                    WorldExplorer.player.isDashing = true;
                    // ダッシュ効果音要請など
                    EventBus.emit('PLAY_SE', { id: 'se_dash' });
                    // 一定時間後にダッシュ状態解除
                    setTimeout(() => {
                        if (WorldExplorer.player) WorldExplorer.player.isDashing = false;
                    }, 200);
                }
                break;
            case 'ACTION_TRIGGER':
                if (isPressed) {
                    this.triggerInteraction();
                }
                break;
        }
    },

    /**
     * 行先選択メニュー表示中のキーボード入力を処理
     */
    handleMenuKey: function(e) {
        const targetId = this.activeMenuTargetId;
        const file = VirtualFileSystem.files[targetId];
        if (!file) {
            this.activeMenuTargetId = null;
            return;
        }

        let destinationId = null;
        let processed = false;

        switch (e.code) {
            case 'Digit1':
            case 'Numpad1':
                destinationId = 'folder-docs';
                processed = true;
                break;
            case 'Digit2':
            case 'Numpad2':
                destinationId = 'folder-images';
                processed = true;
                break;
            case 'Digit3':
            case 'Numpad3':
                destinationId = 'folder-music';
                processed = true;
                break;
            case 'Digit4':
            case 'Numpad4':
                destinationId = 'folder-trash';
                processed = true;
                break;
            case 'Digit0':
            case 'Numpad0':
                if (file.currentFolderId !== 'folder-root') {
                    destinationId = 'folder-root';
                    processed = true;
                }
                break;
            case 'Escape':
                this.activeMenuTargetId = null;
                addLocalLog("Selection cancelled.", "info");
                e.preventDefault();
                return;
        }

        if (processed && destinationId) {
            e.preventDefault();
            this.activeMenuTargetId = null;

            addLocalLog(`Player selected destination: ${destinationId} for ${file.name}`, 'success');

            EventBus.emit('USER_INTENT_ACTION', {
                type: 'MOVE',
                targetFileId: targetId,
                destinationId: destinationId
            });

            EventBus.emit('PLAY_SE', { id: 'se_interact' });
        }
    },

    /**
     * 仮想ファイルシステムと空間データの動的同期
     * 現在表示中のフォルダ（currentViewFolderId）の内容を表示します。
     * ファイルは移動元・移動先・未移動の3状態で色分け表示されます。
     * 移動済みのファイルは移動元フォルダでもゴーストとして表示されます。
     */
    syncVFSToSpatialEntities: function() {
        const updatedEntities = {};
        const vfsFiles = VirtualFileSystem.files || {};
        const vfsFolders = VirtualFileSystem.folders || {};
        const viewId = this.currentViewFolderId || 'folder-root';

        const colCount = 5;
        const gapX = 85;
        const gapY = 65;
        const startX = 60;
        let nextY = 50;

        // 1. ルート以外なら「← 戻る」エンティティを配置
        if (viewId !== 'folder-root') {
            updatedEntities['__back__'] = {
                id: '__back__',
                name: '← 戻る',
                type: 'back',
                x: 20,
                y: 20,
                width: 70,
                height: 28
            };
            nextY = 70;
        }

        // 2. 現在フォルダの子フォルダを横一列に配置
        const childFolders = Object.values(vfsFolders).filter(f => {
            if (f.id === viewId) return false;
            if (viewId === 'folder-root') {
                return f.parentFolderId === 'folder-root' || f.parentFolderId === null;
            }
            return f.parentFolderId === viewId;
        });

        if (childFolders.length > 0) {
            childFolders.forEach((folder, i) => {
                updatedEntities[folder.id] = {
                    id: folder.id,
                    name: folder.name,
                    type: 'folder',
                    folderType: folder.type || 'NORMAL',
                    x: startX + i * (60 + 30),
                    y: nextY,
                    width: 55,
                    height: 50
                };
            });
            nextY += 90;
        }

        // 3a. 現在フォルダに「現在いる」ファイル（placed / unmoved）
        const filesCurrentlyHere = Object.values(vfsFiles).filter(f =>
            !f.isDeleted && f.currentFolderId === viewId
        );
        filesCurrentlyHere.forEach((file, index) => {
            const col = index % colCount;
            const row = Math.floor(index / colCount);
            const isMoved = file.originalFolderId && file.originalFolderId !== file.currentFolderId;
            updatedEntities[file.id] = {
                id: file.id,
                name: file.name,
                type: 'file',
                // 'unmoved': 未移動, 'placed': 移動先に配置済み
                displayState: isMoved ? 'placed' : 'unmoved',
                currentFolderId: file.currentFolderId,
                originalFolderId: file.originalFolderId,
                x: startX + col * gapX,
                y: nextY + row * gapY,
                width: 38,
                height: 38
            };
        });

        // 3b. 移動元ゴースト: originalFolderIdが現在フォルダだが、現在は別のフォルダにいるファイル
        const ghostFiles = Object.values(vfsFiles).filter(f =>
            !f.isDeleted &&
            f.originalFolderId === viewId &&
            f.currentFolderId !== viewId
        );
        // ゴーストは通常ファイルの下にグリッド配置（区別のため別行から）
        const ghostStartRow = Math.ceil(filesCurrentlyHere.length / colCount);
        ghostFiles.forEach((file, index) => {
            const col = index % colCount;
            const row = ghostStartRow + Math.floor(index / colCount);
            updatedEntities[`ghost_${file.id}`] = {
                id: `ghost_${file.id}`,
                realFileId: file.id,
                name: file.name,
                type: 'file',
                displayState: 'ghost',  // 移動元ゴースト
                currentFolderId: file.currentFolderId,
                originalFolderId: file.originalFolderId,
                x: startX + col * gapX,
                y: nextY + row * gapY,
                width: 38,
                height: 38
            };
        });

        this.spatialEntities = updatedEntities;

        // 動的にワールドサイズを計算（エンティティの最大座標＋余白）
        const margin = 120;
        let maxX = 0, maxY = 0;
        Object.values(updatedEntities).forEach(e => {
            const ex = e.x + e.width;
            const ey = e.y + e.height;
            if (ex > maxX) maxX = ex;
            if (ey > maxY) maxY = ey;
        });
        this.WORLD_WIDTH = Math.max(maxX + margin, 820);
        this.WORLD_HEIGHT = Math.max(maxY + margin, 620);
        addLocalLog(`Folder: [${viewId}] | subfolders: ${childFolders.length}, here: ${filesCurrentlyHere.length}, ghosts: ${ghostFiles.length}`);
    },

    /**
     * エンジンのゲームループ開始
     */
    start: function() {
        if (!this.animationFrameId) {
            this.lastTime = performance.now();
            
            // プレイヤー座標が初期状態（0, 0）ならキャンバス中央に補正
            if (WorldExplorer.player && WorldExplorer.player.x === 0 && WorldExplorer.player.y === 0) {
                const canvas = document.getElementById('game-canvas');
                if (canvas) {
                    WorldExplorer.player.x = canvas.width / 2;
                    WorldExplorer.player.y = canvas.height / 2;
                }
            }

            this.gameLoop();
            addLocalLog("Spatial engine core loop started.");
        }
    },

    /**
     * エンジンのゲームループ停止
     */
    stop: function() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            addLocalLog("Spatial engine core loop stopped.");
        }
    },

    /**
     * requestAnimationFrame用のループメソッド
     */
    gameLoop: function() {
        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000; // 秒単位の差分
        this.lastTime = now;

        // 状態更新と衝突判定
        this.update(deltaTime);

        // レンダリング処理
        this.render();

        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    },

    /**
     * 物理座標、ダッシュ、境界制限、および接近判定の更新
     */
    update: function(dt) {
        if (!WorldExplorer.player) return;
        if (this.activeMenuTargetId) return; // メニュー選択中はプレイヤーをフリーズ

        // 1. 移動ベクトルの算出
        let dx = 0;
        let dy = 0;
        if (this.inputState.up) dy -= 1;
        if (this.inputState.down) dy += 1;
        if (this.inputState.left) dx -= 1;
        if (this.inputState.right) dx += 1;

        // 斜め移動の速度正規化
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }

        // ダッシュ中および通常時の実移動速度の決定
        const currentSpeed = WorldExplorer.player.isDashing 
            ? WorldExplorer.player.speed * 2.5 
            : WorldExplorer.player.speed;

        // 座標更新
        WorldExplorer.player.x += dx * currentSpeed;
        WorldExplorer.player.y += dy * currentSpeed;

        // 2. 移動範囲のワールド境界制限
        const canvas = RendererManager.canvas || document.getElementById('game-canvas');
        const viewWidth = canvas ? canvas.width : 800;
        const viewHeight = canvas ? canvas.height : 600;

        // カメラ（追従）の実装を考慮。今回は簡易境界
        if (WorldExplorer.player.x < 15) WorldExplorer.player.x = 15;
        if (WorldExplorer.player.y < 15) WorldExplorer.player.y = 15;
        if (WorldExplorer.player.x > this.WORLD_WIDTH - 15) WorldExplorer.player.x = this.WORLD_WIDTH - 15;
        if (WorldExplorer.player.y > this.WORLD_HEIGHT - 15) WorldExplorer.player.y = this.WORLD_HEIGHT - 15;

        // 3. エンティティ（ファイル）との接近・衝突判定
        let closestEntityId = null;
        let minDistance = this.INTERACT_RANGE;

        Object.keys(this.spatialEntities).forEach((id) => {
            const entity = this.spatialEntities[id];
            // エンティティの中心座標
            const entityCenterX = entity.x + entity.width / 2;
            const entityCenterY = entity.y + entity.height / 2;

            // プレイヤーとの距離計算
            const dist = Math.hypot(WorldExplorer.player.x - entityCenterX, WorldExplorer.player.y - entityCenterY);
            
            if (dist < minDistance) {
                minDistance = dist;
                closestEntityId = id;
            }
        });

        // 接近しているファイル情報に変化があった場合
        if (WorldExplorer.player.interactingTargetId !== closestEntityId) {
            WorldExplorer.player.interactingTargetId = closestEntityId;
            
            if (closestEntityId) {
                const targetName = this.spatialEntities[closestEntityId].name;
                addLocalLog(`Approached object: ${targetName}`, 'info');
                // UI層等へ接近を通知
                EventBus.emit('PLAYER_NEAR_FILE', { id: closestEntityId, name: targetName });
            } else {
                EventBus.emit('PLAYER_NEAR_FILE', { id: null, name: null });
            }
        }
    },

    /**
     * スペースキーやインタラクトキーが押された際のアクションの実行
     */
    triggerInteraction: function() {
        if (!WorldExplorer.player || !WorldExplorer.player.interactingTargetId) return;
        const targetId = WorldExplorer.player.interactingTargetId;
        const entity = this.spatialEntities[targetId];
        if (!entity) return;

        if (entity.type === 'back') {
            // 「戻る」: 親フォルダへ移動
            const currentFolder = VirtualFileSystem.folders[this.currentViewFolderId];
            const parentId = (currentFolder && currentFolder.parentFolderId)
                ? currentFolder.parentFolderId
                : 'folder-root';
            this.enterFolder(parentId);
            EventBus.emit('PLAY_SE', { id: 'se_interact' });
        } else if (entity.type === 'folder') {
            // フォルダに入る
            this.enterFolder(targetId);
            EventBus.emit('PLAY_SE', { id: 'se_interact' });
        } else if (entity.type === 'file') {
            // ファイル: 従来の移動先選択メニューを開く
            this.activeMenuTargetId = targetId;
            addLocalLog(`Select destination for: ${entity.name}`, 'info');
            EventBus.emit('PLAY_SE', { id: 'se_interact' });
        }
    },

    /**
     * 指定フォルダに入る（階層ナビゲーション）
     */
    enterFolder: function(folderId) {
        this.currentViewFolderId = folderId;
        this.cameraOffsetX = 0;
        this.cameraOffsetY = 0;
        // プレイヤーをマップ中央上部にリセット
        const canvas = RendererManager.canvas || document.getElementById('game-canvas');
        if (canvas && WorldExplorer.player) {
            WorldExplorer.player.x = canvas.width / 2;
            WorldExplorer.player.y = 80;
            WorldExplorer.player.interactingTargetId = null;
        }
        this.syncVFSToSpatialEntities();
        const folderName = (VirtualFileSystem.folders[folderId] && VirtualFileSystem.folders[folderId].name)
            ? VirtualFileSystem.folders[folderId].name : folderId;
        addLocalLog(`Entered folder: ${folderName}`, 'info');
    },

    /**
     * Canvas要素への毎フレームレンダリング
     */
    render: function() {
        const ctx = RendererManager.ctx || (RendererManager.canvas && RendererManager.canvas.getContext('2d'));
        const canvas = RendererManager.canvas || document.getElementById('game-canvas');
        if (!ctx || !canvas) return;

        const viewWidth = canvas.width;
        const viewHeight = canvas.height;
        const player = WorldExplorer.player;

        // Camera deadzone logic: camera moves only when player leaves the central zone
        const deadzoneX = viewWidth / 2 - 80; // pixels from center
        const deadzoneY = viewHeight / 2 - 60;

        // Initialize stored offsets if undefined
        if (this.cameraOffsetX === undefined) this.cameraOffsetX = 0;
        if (this.cameraOffsetY === undefined) this.cameraOffsetY = 0;

        let offsetX = this.cameraOffsetX;
        let offsetY = this.cameraOffsetY;

        if (player) {
            // Horizontal adjustment
            if (player.x < offsetX + deadzoneX) {
                offsetX = Math.max(player.x - deadzoneX, 0);
            } else if (player.x > offsetX + viewWidth - deadzoneX) {
                offsetX = Math.min(player.x + deadzoneX - viewWidth, this.WORLD_WIDTH - viewWidth);
            }
            // Vertical adjustment
            if (player.y < offsetY + deadzoneY) {
                offsetY = Math.max(player.y - deadzoneY, 0);
            } else if (player.y > offsetY + viewHeight - deadzoneY) {
                offsetY = Math.min(player.y + deadzoneY - viewHeight, this.WORLD_HEIGHT - viewHeight);
            }

            // Clamp to world bounds
            offsetX = Math.min(Math.max(offsetX, 0), this.WORLD_WIDTH - viewWidth);
            offsetY = Math.min(Math.max(offsetY, 0), this.WORLD_HEIGHT - viewHeight);

            // Store for next frame
            this.cameraOffsetX = offsetX;
            this.cameraOffsetY = offsetY;
        }

        // 1. 背景描画
        ctx.fillStyle = "#1e293b"; // 深いネイビー
        ctx.fillRect(0, 0, viewWidth, viewHeight);

        // 現在フォルダのパン表示HUD（上部中央）
        {
            const viewFolderData = VirtualFileSystem.folders && VirtualFileSystem.folders[this.currentViewFolderId];
            const folderLabel = viewFolderData ? `📁 ${viewFolderData.name}` : `📁 ${this.currentViewFolderId}`;
            const hudW = Math.min(260, viewWidth - 20);
            const hudX = (viewWidth - hudW) / 2;
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.beginPath();
            ctx.roundRect(hudX, 6, hudW, 24, 5);
            ctx.fill();
            ctx.fillStyle = '#90cdf4';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(folderLabel, viewWidth / 2, 22);
            ctx.restore();
        }

        // 2. グリッド描画（カメラオフセット考慮）
        ctx.strokeStyle = "rgba(74, 85, 104, 0.25)";
        ctx.lineWidth = 1;
        const startGridX = Math.floor(offsetX / this.GRID_SIZE) * this.GRID_SIZE;
        const startGridY = Math.floor(offsetY / this.GRID_SIZE) * this.GRID_SIZE;
        for (let x = startGridX; x < offsetX + viewWidth; x += this.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x - offsetX, 0);
            ctx.lineTo(x - offsetX, viewHeight);
            ctx.stroke();
        }
        for (let y = startGridY; y < offsetY + viewHeight; y += this.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y - offsetY);
            ctx.lineTo(viewWidth, y - offsetY);
            ctx.stroke();
        }

        // 3. エンティティ描画（ビューポート外はスキップ）
        Object.keys(this.spatialEntities).forEach((id) => {
            const entity = this.spatialEntities[id];
            const drawX = entity.x - offsetX;
            const drawY = entity.y - offsetY;
            // カリング
            if (drawX + entity.width < 0 || drawY + entity.height < 0 || drawX > viewWidth || drawY > viewHeight) {
                return;
            }
            const isSelected = (this.selectedFileIds && this.selectedFileIds.includes(id));
            const isTarget = (player && player.interactingTargetId === id);
            ctx.save();
            // ハイライト
            if (isTarget) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#63b3ed";
                ctx.strokeStyle = "#63b3ed";
                ctx.lineWidth = 2;
                ctx.strokeRect(drawX - 4, drawY - 4, entity.width + 8, entity.height + 8);
            } else if (isSelected) {
                ctx.strokeStyle = "#ecc94b";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(drawX - 2, drawY - 2, entity.width + 4, entity.height + 4);
            }
            // 描画タイプ別
            if (entity.type === 'back') {
                // 「← 戻る」ボタン
                ctx.fillStyle = isTarget ? '#4a5568' : '#2d3748';
                ctx.beginPath();
                ctx.roundRect(drawX, drawY, entity.width, entity.height, 6);
                ctx.fill();
                ctx.strokeStyle = isTarget ? '#90cdf4' : '#718096';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = '#e2e8f0';
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('← 戻る', drawX + entity.width / 2, drawY + entity.height / 2 + 4);
                ctx.restore();
                return; // ラベルは上で描いたのでスキップ
            } else if (entity.type === 'folder') {
                ctx.fillStyle = "#3182ce";
                ctx.beginPath();
                ctx.roundRect(drawX, drawY, entity.width, entity.height, 4);
                ctx.fill();
                ctx.fillStyle = "#2b6cb0";
                ctx.fillRect(drawX + 4, drawY - 6, entity.width / 2, 6);
            } else {
                ctx.fillStyle = "#718096";
                ctx.beginPath();
                ctx.roundRect(drawX, drawY, entity.width, entity.height, 2);
                ctx.fill();
                ctx.strokeStyle = "#a0aec0";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(drawX + 6, drawY + 10);
                ctx.lineTo(drawX + entity.width - 6, drawY + 10);
                ctx.moveTo(drawX + 6, drawY + 18);
                ctx.lineTo(drawX + entity.width - 6, drawY + 18);
                ctx.stroke();
            }
            // ラベル描画
            ctx.fillStyle = "#e2e8f0";
            ctx.font = "10px monospace";
            ctx.textAlign = "center";
            ctx.fillText(entity.name, drawX + entity.width / 2, drawY + entity.height + 15);
            ctx.restore();
        });

        // 4. プレイヤー描画（カメラオフセットを適用）
        if (player) {
            const drawPx = player.x - offsetX;
            const drawPy = player.y - offsetY;
            ctx.save();
            if (player.isDashing) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = "#f6e05e";
            }
            ctx.fillStyle = "#f6e05e";
            ctx.beginPath();
            ctx.arc(drawPx, drawPy, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#1a202c";
            ctx.lineWidth = 2;
            ctx.stroke();

            // 接近対象がある場合のコネクションビーム（カメラオフセット適用）
            if (player.interactingTargetId && this.spatialEntities[player.interactingTargetId]) {
                const target = this.spatialEntities[player.interactingTargetId];
                ctx.strokeStyle = "rgba(99, 179, 237, 0.6)";
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(drawPx, drawPy);
                ctx.lineTo(target.x + target.width / 2 - offsetX, target.y + target.height / 2 - offsetY);
                ctx.stroke();
            }

            ctx.restore();
        }

        // 4. 行先選択メニューの描画
        if (this.activeMenuTargetId && this.spatialEntities[this.activeMenuTargetId]) {
            const file = VirtualFileSystem.files[this.activeMenuTargetId];
            
            if (file) {
                ctx.save();
                
                // メニュー背景
                const menuW = 280;
                const menuH = file.currentFolderId !== 'folder-root' ? 170 : 145;
                const menuX = canvas.width / 2 - menuW / 2;
                const menuY = canvas.height / 2 - menuH / 2;
                
                ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
                ctx.strokeStyle = "#63b3ed";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(menuX, menuY, menuW, menuH, 8);
                ctx.fill();
                ctx.stroke();
                
                // タイトル
                ctx.fillStyle = "#63b3ed";
                ctx.font = "bold 13px monospace";
                ctx.textAlign = "center";
                ctx.fillText(`[ ${file.name} ] の移動先`, menuX + menuW / 2, menuY + 25);
                
                // 選択肢
                ctx.fillStyle = "#e2e8f0";
                ctx.font = "12px monospace";
                ctx.textAlign = "left";
                
                let startTextY = menuY + 50;
                const options = [
                    "1: Documents (書類整理庫)",
                    "2: Photos (画像ギャラリー)",
                    "3: Music (音楽ホール)",
                    "4: Trash (ゴミ箱)"
                ];
                
                if (file.currentFolderId !== 'folder-root') {
                    options.unshift("0: Downloads (整理元に戻す)");
                }
                options.push("Esc: キャンセル");
                
                options.forEach((opt, idx) => {
                    ctx.fillText(opt, menuX + 25, startTextY + idx * 20);
                });
                
                ctx.restore();
            }
        }

        // 5. ミニマップ描画（右下コーナー）
        this.renderMinimap(ctx, canvas, offsetX, offsetY);
    },

    /**
     * ミニマップ描画
     */
    renderMinimap: function(ctx, canvas, offsetX, offsetY) {
        const player = WorldExplorer.player;
        const mmW = 140;
        const mmH = 100;
        const mmPad = 10;
        const mmX = canvas.width - mmW - mmPad;
        const mmY = canvas.height - mmH - mmPad;
        const scaleX = mmW / this.WORLD_WIDTH;
        const scaleY = mmH / this.WORLD_HEIGHT;

        ctx.save();

        // 背景
        ctx.fillStyle = 'rgba(10, 20, 40, 0.85)';
        ctx.strokeStyle = 'rgba(99, 179, 237, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mmX, mmY, mmW, mmH, 5);
        ctx.fill();
        ctx.stroke();

        // ビューポート範囲を示す矩形
        const vpX = mmX + offsetX * scaleX;
        const vpY = mmY + offsetY * scaleY;
        const vpW = canvas.width * scaleX;
        const vpH = canvas.height * scaleY;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpX, vpY, vpW, vpH);

        // エンティティの点
        Object.values(this.spatialEntities).forEach(e => {
            const ex = mmX + e.x * scaleX;
            const ey = mmY + e.y * scaleY;
            ctx.fillStyle = e.type === 'folder' ? '#3182ce' : '#718096';
            ctx.fillRect(ex, ey, Math.max(2, e.width * scaleX), Math.max(2, e.height * scaleY));
        });

        // プレイヤーの点
        if (player) {
            const px = mmX + player.x * scaleX;
            const py = mmY + player.y * scaleY;
            ctx.fillStyle = '#f6e05e';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // ラベル
        ctx.fillStyle = 'rgba(160, 174, 192, 0.8)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('MINIMAP', mmX + 4, mmY + 9);

        ctx.restore();
    }
};

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

// グローバルスコープにエンジンを展開
window.spatialEngineCore = SpatialEngineCore;